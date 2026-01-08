# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Which versions are eligible for receiving such patches depends on the CVSS v3.0 Rating:

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest| :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue. Instead, please report it privately.

### How to Report

1. **Email**: Send details to [security@dodopayments.com](mailto:security@dodopayments.com)
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- We will acknowledge receipt of your report within 48 hours
- We will provide an initial assessment within 7 days
- We will keep you informed of our progress
- We will notify you when the vulnerability is fixed

### Disclosure Policy

- We will work with you to understand and resolve the issue quickly
- We will credit you for the discovery (unless you prefer to remain anonymous)
- We will coordinate public disclosure after a fix is available

## Security Best Practices

When using ContextMCP:

- Keep your dependencies up to date
- Use environment variables for sensitive configuration (API keys, etc.)
- Review your `config.yaml` before committing to version control
- Regularly rotate API keys and credentials
- Follow the principle of least privilege for API access

Thank you for helping keep ContextMCP and its users safe!

