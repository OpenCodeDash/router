# Basic LLM Router

Acts as a proxy for your LLM providers with support for fallbacks and schedules.

### Example config.yaml

```yaml
models:
  smart:
    baseUrl: "http://10.253.0.19:8080/v1"
    upstreamModel: "qwen3.8-27b"
  dumb:
    baseUrl: "http://10.253.0.19:8081/v1"
    upstreamModel: "gpt-oss-20b"
  opencode-go-glm-5.2:
    baseUrl: "https://opencode.ai/zen/go/v1"
    upstreamModel: GLM-5.2
    apiKeyEnv: "XXX"
  gpt-5.6-luna:
    baseUrl: "https://opencode.ai/zen/go/v1"
    upstreamModel: "gpt-5.6-luna"
    apiKeyEnv: "OPENCODE_GO_API_KEY"
routes:
  main:
    models:
      - smart
  fast:
    models:
      - dumb
      - smart
  gpt-5.6-luna:
    models:
      - gpt-5.6-luna
timetable:
  - cron: 0 22 * * *
    event:
      type: disable-model
      model: opencode-go-glm-5.2
  - cron: 0 8 * * *
    event:
      type: enable-model
      model: opencode-go-glm-5.2
```
