# Security

[← Documentation index](./README.md) | Language: [日本語](../ja/security.md) | **English**

Bracify includes several built-in protection features to support safe frontend development.

- **Auto-Escaping**: Data expansion via `{placeholder}` is automatically HTML-escaped (treated as plain text), preventing XSS (Cross-Site Scripting).
- **Secure Data Injection**: When injecting data into HTML during SSR or build processes, it is automatically escaped to prevent script tag interference (such as `</script>` breakouts).
- **URL Sanitization**: When embedding data into `href` or `src` attributes, any dangerous protocols such as `javascript:` are automatically detected and disabled to prevent unexpected script execution.
- **Underscore Guard (SSR-Only)**:
  When running as a server, it rejects all external direct access (403 Forbidden) to resources where the directory or file name at the root starts with an underscore (`_`).
  This blocks unauthorized access to internal info like `data.db` or include components (`_parts/`) at the web server level.
  * Note: Official form endpoints (like `POST /_sys/data/*.json`) are exempt from this restriction.
- **Cross-origin protection (Data API)**: any `POST` / `PUT` / `DELETE` request to `/_sys/data/*.json` (including `?_method=` overrides) whose `Origin` header differs from `Host` is rejected with 403 (requests without an `Origin` header, such as ordinary form submissions, are allowed).
