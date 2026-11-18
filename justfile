# Run the model tests.
test:
    node --test 'test/*.test.mjs'

# Serve the app locally (GitHub Pages serves it in production).
serve port="8737":
    node tools/serve.mjs {{port}}
