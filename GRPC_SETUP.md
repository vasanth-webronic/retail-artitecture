# gRPC Server Setup for 24_api

This document explains how to set up the gRPC server in 24_api to communicate with vm-service using mTLS (mutual TLS).

## Overview

The 24_api service acts as a **gRPC server** that implements the `StoreService` interface. The vm-service connects to this server as a **gRPC client** using mTLS for secure authentication.

## Architecture

```
vm-service (Client)         24_api (Server)
    |                            |
    |  (Client Cert)             |  (Server Cert)
    |  (CA Cert)                 |  (CA Cert)
    |                            |
    |<---- mTLS gRPC Connection --->|
    |                            |
```

## Prerequisites

1. Node.js >= 12.0.0
2. Certificates generated from vm-service
3. gRPC dependencies installed

## Step 1: Generate Certificates

First, generate certificates in the vm-service project:

```bash
cd ../vk/vm-service
./scripts/generate_certs.sh
```

This will create:
- `ca.crt` - Certificate Authority (shared)
- `server.crt` + `server.key` - For 24_api (gRPC server)
- `client.crt` + `client.key` - For vm-service (gRPC client)

## Step 2: Copy Certificates

Use the provided script to copy certificates from vm-service to 24_api:

```bash
cd 24_api
./scripts/copy-grpc-certs.sh
```

Or manually copy:
```bash
mkdir -p certs/grpc
cp ../vk/vm-service/certs/ca.crt certs/grpc/
cp ../vk/vm-service/certs/server.crt certs/grpc/
cp ../vk/vm-service/certs/server.key certs/grpc/
chmod 600 certs/grpc/server.key
chmod 644 certs/grpc/*.crt
```

## Step 3: Install Dependencies

Install gRPC dependencies:

```bash
npm install
```

This will install:
- `@grpc/grpc-js` - gRPC implementation for Node.js
- `@grpc/proto-loader` - Proto file loader

## Step 4: Configure Environment Variables

Add the following to your `.env.local` or `.tawenv` file:

```env
# gRPC Server Configuration
GRPC_PORT=50051

# gRPC mTLS Certificate Configuration
GRPC_SERVER_CERT_PATH=certs/grpc/server.crt
GRPC_SERVER_KEY_PATH=certs/grpc/server.key
GRPC_CA_CERT_PATH=certs/grpc/ca.crt
GRPC_REQUIRE_CLIENT_CERT=true
```

## Step 5: Start the Server

Start the 24_api server:

```bash
npm run dev
# or
npm start
```

The gRPC server will start automatically alongside the HTTP server. You should see:

```
gRPC server started on port 50051 with mTLS
Server certificate: certs/grpc/server.crt
CA certificate: certs/grpc/ca.crt
Client certificate required: true
```

## Implementation Details

### StoreService Methods

The gRPC server implements two methods:

1. **VerifyStoreAccess**
   - Verifies if a project has access to a specific store
   - Parameters: `project_id`, `store_id`
   - Returns: `has_access`, `message`, `store_id`, `project_id`

2. **GetStoreInfo**
   - Fetches complete store information
   - Parameters: `project_id`, `store_id`
   - Returns: `exists`, `store_id`, `name`, `environment`, `project_id`, `metadata`, `updated_at`

### Environment Detection

The server gets the environment from the gRPC request metadata (headers). The client must send the environment in the metadata with one of these values:
- `prod` - Production environment
- `master` - Master environment  
- `demo` - Demo environment (default if not specified)

**Metadata Key**: The server checks for `env` first (matches HTTP API pattern), and falls back to `x-environment` for compatibility with existing vm-service implementations.

**Example (vm-service Go client)**:
```go
ctx = metadata.AppendToOutgoingContext(ctx, "env", "prod")
// or for compatibility:
ctx = metadata.AppendToOutgoingContext(ctx, "x-environment", "prod")
```

This matches the HTTP API pattern where the environment is passed via the `env` header.

### Security

- **mTLS**: Both client and server authenticate using certificates
- **Client Certificate Required**: Server verifies client certificates against the CA
- **Secure Key Storage**: Private keys should be kept secure (600 permissions)

## Testing

### Test with grpcurl

```bash
# Install grpcurl
go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest

# Test VerifyStoreAccess
grpcurl -cacert certs/grpc/ca.crt \
        -cert ../vk/vm-service/certs/client.crt \
        -key ../vk/vm-service/certs/client.key \
        -d '{"project_id": "test-project", "store_id": "test-store"}' \
        localhost:50051 \
        store.StoreService/VerifyStoreAccess

# Test GetStoreInfo
grpcurl -cacert certs/grpc/ca.crt \
        -cert ../vk/vm-service/certs/client.crt \
        -key ../vk/vm-service/certs/client.key \
        -d '{"project_id": "test-project", "store_id": "test-store"}' \
        localhost:50051 \
        store.StoreService/GetStoreInfo
```

## Troubleshooting

### Error: "Server certificate not found"

**Solution**: Ensure certificates are copied to the correct location:
```bash
ls -la certs/grpc/
```

### Error: "Failed to start gRPC server"

**Solution**: 
1. Check certificate file permissions
2. Verify certificate paths in environment variables
3. Ensure port 50051 is not already in use

### Error: "connection refused"

**Solution**:
1. Verify gRPC server is running (check logs)
2. Check firewall rules
3. Verify vm-service is using the correct server URL

### Error: "bad certificate"

**Solution**:
1. Ensure both services use the same CA certificate
2. Verify client certificate is signed by the CA
3. Check that `GRPC_REQUIRE_CLIENT_CERT=true` is set

## File Structure

```
24_api/
├── src/
│   ├── proto/
│   │   └── store.proto          # Proto definition
│   ├── server/
│   │   └── grpcServer.js        # gRPC server implementation
│   ├── services/
│   │   └── shop.service.js      # Shop service (used by gRPC)
│   ├── config/
│   │   └── config.js            # Configuration (includes gRPC settings)
│   └── index.js                 # Main entry (starts gRPC server)
├── certs/
│   └── grpc/
│       ├── ca.crt               # CA certificate
│       ├── server.crt           # Server certificate
│       └── server.key            # Server private key
└── scripts/
    └── copy-grpc-certs.sh       # Certificate copy script
```

## Next Steps

1. Configure vm-service to connect to this gRPC server
2. Set `grpc_server_url` in vm-service project configuration
3. Test end-to-end communication
4. Monitor logs for any connection issues

## Security Best Practices

1. **Never commit certificates to version control**
   - Add `certs/**/*.key` and `certs/**/*.crt` to `.gitignore`

2. **Protect private keys**
   - Set permissions: `chmod 600 certs/grpc/server.key`
   - Use secrets management in production

3. **Use different certificates for different environments**
   - Dev, staging, and production should have separate certificates

4. **Monitor certificate expiration**
   - Set up alerts for certificate expiration
   - Rotate certificates before expiration
