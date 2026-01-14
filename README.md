# Microservices Architecture Overview

## Introduction

This document provides a comprehensive overview of the microservices architecture for the Retail ERP system. The architecture is designed to be scalable, maintainable, and adaptable to various industries beyond retail.

## Current State

The system currently operates as a **monolithic Node.js application** (`24_api`) with:

- Single Express.js API server handling all business domains
- **DynamoDB** as the primary database (using OneTable pattern)
- Next.js frontend (`24_front`)
- One Go microservice (`vm-service`) communicating via gRPC
- Multiple business domains tightly coupled in one codebase

## Target Architecture

The target architecture follows microservices principles with:

- **Independent services** for each business domain
- **Database per service** pattern (DynamoDB for most services)
- **API Gateway** as single entry point
- **Event-driven communication** for loose coupling
- **Service discovery** for dynamic service location
- **Container orchestration** for deployment and scaling

## Core Microservice Patterns

### 1. API Gateway Pattern

**Purpose**: Single entry point for all client requests, routing to appropriate microservices.

**Benefits for Retail ERP:**
- Centralized authentication/authorization
- Rate limiting and throttling
- Request/response transformation
- Load balancing across services
- API versioning

**Implementation**: Kong, AWS API Gateway, or NGINX

```mermaid
graph TB
    Client[Client Applications]
    Gateway[API Gateway<br/>Authentication<br/>Rate Limiting<br/>Routing]
    
    AuthSvc[Auth Service]
    ProductSvc[Product Service]
    OrderSvc[Order Service]
    PaymentSvc[Payment Service]
    InventorySvc[Inventory Service]
    
    Client --> Gateway
    Gateway --> AuthSvc
    Gateway --> ProductSvc
    Gateway --> OrderSvc
    Gateway --> PaymentSvc
    Gateway --> InventorySvc
```

### 2. Database per Service Pattern

**Purpose**: Each microservice has its own database, ensuring loose coupling.

**Benefits for Retail ERP:**
- Independent scaling
- Technology diversity (DynamoDB for most, PostgreSQL for transactions)
- Data isolation and security
- Independent deployment

**Current Implementation**: DynamoDB with OneTable pattern

**Diagram:**
```mermaid
graph TB
    ProductSvc[Product Service]
    OrderSvc[Order Service]
    PaymentSvc[Payment Service]
    InventorySvc[Inventory Service]
    
    ProductDB[(Product DB<br/>DynamoDB)]
    OrderDB[(Order DB<br/>DynamoDB)]
    PaymentDB[(Payment DB<br/>PostgreSQL)]
    InventoryDB[(Inventory DB<br/>DynamoDB)]
    
    ProductSvc --> ProductDB
    OrderSvc --> OrderDB
    PaymentSvc --> PaymentDB
    InventorySvc --> InventoryDB
```

### 3. Saga Pattern

**Purpose**: Manage distributed transactions across multiple services.

**Critical for Retail ERP**: Order processing involves multiple services (inventory, payment, shipping).

**Implementation**: Event-driven choreography pattern

```mermaid
sequenceDiagram
    participant Client
    participant OrderSvc as Order Service
    participant InventorySvc as Inventory Service
    participant PaymentSvc as Payment Service
    participant NotificationSvc as Notification Service
    
    Client->>OrderSvc: Create Order
    OrderSvc->>OrderSvc: Reserve Order
    OrderSvc->>InventorySvc: Reserve Inventory (Event)
    InventorySvc->>PaymentSvc: Process Payment (Event)
    PaymentSvc->>NotificationSvc: Send Confirmation (Event)
    NotificationSvc->>Client: Order Confirmed
    
    alt Payment Fails
        PaymentSvc->>InventorySvc: Release Inventory (Event)
        InventorySvc->>OrderSvc: Order Cancelled (Event)
    end
```

### 4. CQRS (Command Query Responsibility Segregation)

**Purpose**: Separate read and write operations for better performance and scalability.

**Benefits for Retail ERP:**
- Optimized read models for reporting
- Independent scaling of read/write operations
- Better performance for analytics dashboards

**Diagram:**
```mermaid
graph TB
    CommandSide[Command Side<br/>Write Operations]
    QuerySide[Query Side<br/>Read Operations]
    
    WriteDB[(Write Database<br/>DynamoDB)]
    ReadDB[(Read Database<br/>DynamoDB/Elasticsearch)]
    
    EventBus[Event Bus]
    
    CommandSide --> WriteDB
    WriteDB --> EventBus
    EventBus --> QuerySide
    QuerySide --> ReadDB
    
    Client1[Admin Panel<br/>Writes] --> CommandSide
    Client2[Dashboard<br/>Reads] --> QuerySide
```

### 5. Event Sourcing Pattern

**Purpose**: Store all changes as a sequence of events, enabling audit trails and time travel.

**Benefits for Retail ERP:**
- Complete audit trail (critical for compliance)
- Replay events for debugging
- Build multiple read models from events
- Financial transaction history

**Diagram:**
```mermaid
graph LR
    OrderSvc[Order Service]
    EventStore[(Event Store<br/>DynamoDB Streams/Kafka)]
    
    ReadModel1[(Order Read Model<br/>DynamoDB)]
    ReadModel2[(Analytics Model<br/>Elasticsearch)]
    ReadModel3[(Audit Log<br/>DynamoDB)]
    
    OrderSvc -->|Events| EventStore
    EventStore --> ReadModel1
    EventStore --> ReadModel2
    EventStore --> ReadModel3
```

### 6. Circuit Breaker Pattern

**Purpose**: Prevent cascading failures by stopping requests to failing services.

**Critical for Retail ERP**: Payment service failure shouldn't crash the entire system.

**Implementation**: Use libraries like `opossum` (Node.js) or `resilience4j` (Java)

```mermaid
stateDiagram-v2
    [*] --> Closed: Normal Operation
    Closed --> Open: Failure Threshold Reached
    Open --> HalfOpen: Timeout Expired
    HalfOpen --> Closed: Success
    HalfOpen --> Open: Failure
    Open --> [*]: Service Recovered
```

## Service Architecture Overview

```mermaid
graph TB
    subgraph Clients
        WebApp[Web App<br/>24_front]
        MobileApp[Mobile App]
        AdminPanel[Admin Panel]
    end
    
    subgraph API Layer
        Gateway[API Gateway<br/>Kong/AWS API Gateway]
        AuthBFF[Auth BFF]
        AdminBFF[Admin BFF]
    end
    
    subgraph Core Services
        AuthSvc[Auth Service<br/>JWT, RBAC]
        UserSvc[User Service<br/>Customer & Staff]
        ProductSvc[Product Service<br/>Catalog Management]
        InventorySvc[Inventory Service<br/>Stock Management]
        OrderSvc[Order Service<br/>Order Processing]
        PaymentSvc[Payment Service<br/>Payment Gateway]
        ShopSvc[Shop Service<br/>Store Management]
    end
    
    subgraph Supporting Services
        NotificationSvc[Notification Service<br/>Email, SMS, Push]
        CampaignSvc[Campaign Service<br/>Promotions & Offers]
        ReportSvc[Report Service<br/>Analytics]
        IoTGateway[IoT Gateway<br/>Device Management]
    end
    
    subgraph Infrastructure
        EventBus[Event Bus<br/>RabbitMQ/Kafka/AWS EventBridge]
        Redis[Redis Cache]
        ServiceRegistry[Service Registry<br/>Consul/K8s]
    end
    
    subgraph Data Layer
        AuthDB[(Auth DB<br/>DynamoDB)]
        UserDB[(User DB<br/>DynamoDB)]
        ProductDB[(Product DB<br/>DynamoDB)]
        InventoryDB[(Inventory DB<br/>DynamoDB)]
        OrderDB[(Order DB<br/>DynamoDB)]
        PaymentDB[(Payment DB<br/>PostgreSQL)]
        ShopDB[(Shop DB<br/>DynamoDB)]
    end
    
    WebApp --> Gateway
    MobileApp --> Gateway
    AdminPanel --> Gateway
    
    Gateway --> AuthBFF
    Gateway --> AdminBFF
    
    AuthBFF --> AuthSvc
    AdminBFF --> UserSvc
    AdminBFF --> ProductSvc
    AdminBFF --> OrderSvc
    AdminBFF --> PaymentSvc
    
    AuthSvc --> AuthDB
    UserSvc --> UserDB
    ProductSvc --> ProductDB
    InventorySvc --> InventoryDB
    OrderSvc --> OrderDB
    PaymentSvc --> PaymentDB
    ShopSvc --> ShopDB
    
    OrderSvc --> EventBus
    InventorySvc --> EventBus
    PaymentSvc --> EventBus
    EventBus --> NotificationSvc
    
    ProductSvc --> Redis
    InventorySvc --> Redis
    
    Gateway --> ServiceRegistry
    AuthSvc --> ServiceRegistry
    OrderSvc --> ServiceRegistry
```

## Communication Patterns

### Synchronous Communication

**REST API**: Used for real-time operations requiring immediate response
- Order → Inventory (stock check)
- Order → Payment (payment processing)

**gRPC**: Used for inter-service communication requiring high performance
- IoT Gateway → Shop Service (device status)
- vm-service → Shop Service (vending machine operations)

### Asynchronous Communication

**Event-Driven**: Used for eventual consistency and decoupling
- Order created → Notification service
- Inventory updated → Report service
- Payment processed → Order service

**Message Queue**: RabbitMQ, Apache Kafka, or AWS EventBridge
- Reliable message delivery
- Event replay capability
- Multiple consumers support

## Technology Stack

### Current Stack (24_api)
- **Runtime**: Node.js (>=12.0.0)
- **Framework**: Express.js
- **Database**: DynamoDB (OneTable pattern)
- **Cache**: Redis
- **Message Queue**: Bull/BullMQ (Redis-based)
- **Authentication**: JWT (Passport.js)
- **gRPC**: @grpc/grpc-js

### Target Stack (Microservices)

See [Service Boundaries](./service-boundaries.md) for detailed tech stack per service.

## Migration Strategy

We follow the **Strangler Fig Pattern** to gradually migrate from monolith to microservices:

1. **Phase 1**: Extract Authentication Service
2. **Phase 2**: Extract Product & Inventory Services
3. **Phase 3**: Extract Order Service
4. **Phase 4**: Extract Payment Service
5. **Phase 5**: Extract Supporting Services

Each phase maintains backward compatibility with the existing monolith.

## Benefits

### Scalability
- Scale individual services based on demand
- Inventory service scales during peak shopping seasons
- Report service scales for batch processing

### Reliability
- Service failures are isolated
- Circuit breakers prevent cascading failures
- Health checks ensure service availability

### Maintainability
- Teams can work independently on services
- Technology diversity (use best tool for each service)
- Easier to test and deploy

### Performance
- Optimized databases per service
- Caching strategies per service
- Read/write separation (CQRS)

## Cross-Industry Applicability

This architecture is adaptable to:

1. **E-commerce**: Same core services (Product, Order, Payment, Inventory)
2. **Healthcare**: Replace Shop with Clinic, add Patient Service
3. **Manufacturing**: Add Production Service, Supply Chain Service
4. **Hospitality**: Add Booking Service, Room Service
5. **Logistics**: Add Shipping Service, Route Optimization Service

## Next Steps

1. Review [Service Boundaries](./service-boundaries.md) for detailed service definitions
2. Review [Communication Patterns](./communication-patterns.md) for inter-service communication
3. Set up development environment with Docker Compose
4. Start with Auth Service extraction (lowest risk)
5. Implement API Gateway to route traffic
6. Set up monitoring and observability
