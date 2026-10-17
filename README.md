# Harbor Parcel

A browser shipping calculator with a JavaScript desk and a private, dependency-free
Rust tariff service. Synthetic rates and data; no accounts, payments or credentials.

The desk serves HTML/CSS/JS and forwards requests to the Rust service. On Dev the
Rust service follows the automatic WASI HTTP stdio contract: one raw HTTP request
on stdin, one JSON value on stdout. The same handler runs locally with `--serve`.
Business validation is `{ok:false,error:...}` inside the JSON response; the desk
maps it to HTTP 422. No claim that the native JSON adapter carries custom status.

Default release 1: DE, 1200 grams, 2 parcels costs 1400 net + 266 tax = 1666 cents.
CSV `de,1200,2` plus `eu,500,1` costs 2927 cents. Weights 1..30000 grams,
quantities 1..100, at most 100 batch rows. Invalid data is rejected.
Optional SURCHARGE_CENTS is a synthetic public tariff configuration, not a secret.

Release 2 changes the German base tariff from 490 to 540 cents. Default example:
1785 cents per DE quote and 3046 cents for the two CSV rows. With the public
SURCHARGE_CENTS=25 setting, expected totals are 1845 and 3136 cents. Rolling back
to release 1 while retaining that setting yields 1726 and 3017 cents.

Release 3 retains release 2 rates and accepts an absent or empty optional surcharge
as zero. Dev source detection materializes referenced environment variables as
empty strings; that differs from leaving the variable absent on a local shell.
Nonempty malformed values remain explicit configuration errors. Set the public
SURCHARGE_CENTS=25 using `lly env` to test the configured case.

Local control, no Cargo dependencies/build:

    mkdir -p .local
    rustc --edition=2021 services/tariff/src/main.rs -o .local/tariff
    .local/tariff --serve
    TARIFF_URL=http://127.0.0.1:8231 node apps/desk/server.js

Open http://localhost:3230. Dev: initialize both roots with lily.toml, wait for the
first rollout, obtain the actual private tariff URL from `lly network`, configure
TARIFF_URL on the desk, redeploy it, and expose only the desk. Never guess slug DNS.
No database or statefulness is required; every quote is computed from its input.
