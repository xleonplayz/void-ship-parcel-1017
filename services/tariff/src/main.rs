use std::io::{self, Read, Write};

const RELEASE: u64 = 2;
const BASE_DE: u64 = 540;

fn quote(zone: &str, grams: &str, quantity: &str) -> Result<(u64, u64, u64), &'static str> {
    let base = match zone { "de" => BASE_DE, "eu" => 990, _ => return Err("unsupported zone") };
    let grams = grams.parse::<u64>().map_err(|_| "invalid weight")?;
    let quantity = quantity.parse::<u64>().map_err(|_| "invalid quantity")?;
    if grams == 0 || grams > 30000 { return Err("weight must be 1..30000 grams"); }
    if quantity == 0 || quantity > 100 { return Err("quantity must be 1..100"); }
    let surcharge = std::env::var("SURCHARGE_CENTS").unwrap_or_else(|_| "0".into())
        .parse::<u64>().map_err(|_| "invalid surcharge configuration")?;
    if surcharge > 10000 { return Err("surcharge configuration too large"); }
    let net = (base + ((grams + 499) / 500) * 70 + surcharge) * quantity;
    let tax = (net * 19 + 50) / 100;
    Ok((net, tax, net + tax))
}

fn fail(error: &str) -> String { format!("{{\"ok\":false,\"error\":\"{}\",\"release\":{}}}", error, RELEASE) }

fn answer(raw: &str) -> String {
    let mut first = raw.lines().next().unwrap_or("GET /health HTTP/1.1").split_whitespace();
    let method = first.next().unwrap_or("GET");
    let path = first.next().unwrap_or("/health").split('?').next().unwrap_or("/health");
    eprintln!("parcel-tariff method={} path={} release={}", method, path, RELEASE);
    if path == "/health" || path == "/" {
        return format!("{{\"ok\":true,\"service\":\"rust-tariff\",\"release\":{}}}", RELEASE);
    }
    if method == "GET" && path.starts_with("/quote/") {
        let parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
        if parts.len() != 4 { return fail("expected quote/zone/grams/quantity"); }
        return match quote(parts[1], parts[2], parts[3]) {
            Ok((net, tax, total)) => format!("{{\"ok\":true,\"netCents\":{},\"taxCents\":{},\"totalCents\":{},\"release\":{}}}", net, tax, total, RELEASE),
            Err(error) => fail(error),
        };
    }
    if method == "POST" && path == "/batch" {
        let body = raw.split_once("\r\n\r\n").map(|(_, b)| b).or_else(|| raw.split_once("\n\n").map(|(_, b)| b)).unwrap_or("");
        let mut count = 0;
        let mut total = 0;
        for line in body.lines().filter(|line| !line.trim().is_empty()) {
            let parts: Vec<&str> = line.split(',').map(str::trim).collect();
            if parts.len() != 3 { return fail("CSV needs zone,grams,quantity"); }
            if count >= 100 { return fail("at most 100 rows"); }
            match quote(parts[0], parts[1], parts[2]) { Ok((_, _, cents)) => total += cents, Err(error) => return fail(error) }
            count += 1;
        }
        if count == 0 { return fail("empty batch"); }
        return format!("{{\"ok\":true,\"count\":{},\"totalCents\":{},\"release\":{}}}", count, total, RELEASE);
    }
    fail("unknown route or method")
}

#[cfg(not(target_os = "wasi"))]
fn serve() {
    use std::net::TcpListener;
    let port = std::env::var("PORT").unwrap_or_else(|_| "8231".into());
    for stream in TcpListener::bind(format!("127.0.0.1:{}", port)).expect("bind").incoming() {
        let mut stream = stream.expect("stream");
        stream.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
        let mut bytes = Vec::new();
        loop {
            let mut chunk = [0; 4096];
            let n = stream.read(&mut chunk).unwrap_or(0);
            if n == 0 { break; }
            bytes.extend_from_slice(&chunk[..n]);
            if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&bytes[..end]);
                let length = headers.lines().find_map(|line| line.split_once(':').filter(|(k, _)| k.eq_ignore_ascii_case("content-length")).and_then(|(_, v)| v.trim().parse::<usize>().ok())).unwrap_or(0);
                if bytes.len() >= end + 4 + length { break; }
            }
            if bytes.len() > 65536 { break; }
        }
        let body = answer(&String::from_utf8_lossy(&bytes));
        let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
    }
}

fn main() {
    #[cfg(not(target_os = "wasi"))]
    if std::env::args().any(|arg| arg == "--serve") { serve(); return; }
    let mut raw = String::new();
    io::stdin().read_to_string(&mut raw).expect("request input");
    println!("{}", answer(&raw));
}
