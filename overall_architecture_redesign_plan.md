# Microservice Architecture Redesign Plan

## Current State Analysis

Your current system is a **monolithic Node.js application** (`24_api`) with:

- Single Express.js API server handling all domains
- **DynamoDB** as primary database (using OneTable pattern)
- Next.js frontend (`24_front`)
- One Go microservice (`vm-service`) communicating via gRPC
- Multiple business domains mixed in one codebase

**Identified Business Domains:**

- Authentication & User Management
- Product & Inventory Management
- Order Management
- Shop/Store Management
- Payment Processing
- Campaign & Promotions
- Reporting & Analytics
- Notifications
- IoT Device Management
- Support & Tickets

## Microservice Patterns Overview

### 1. API Gateway Pattern

**Purpose**: Single entry point for all client requests, routing to appropriate microservices.

**Benefits for Retail ERP:**

- Centralized authentication/authorization
- Rate limiting and throttling
- Request/response transformation
- Load balancing across services
- API versioning

**Diagram:**

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

### 2. Service Discovery Pattern

**Purpose**: Services register themselves and discover other services dynamically.

**Benefits:**

- Dynamic scaling
- Health checking
- Load distribution
- Service resilience

**Implementation Options:**

- **Client-side discovery**: Consul, Eureka
- **Server-side discovery**: Kubernetes DNS, AWS ECS Service Discovery

**Diagram:**

```mermaid
graph TB
    Service1[Product Service]
    Service2[Order Service]
    Service3[Payment Service]
    
    Registry[Service Registry<br/>Consul/Eureka/K8s DNS]
    
    Gateway[API Gateway]
    
    Service1 -->|Register| Registry
    Service2 -->|Register| Registry
    Service3 -->|Register| Registry
    
    Gateway -->|Discover| Registry
    Registry -->|Service List| Gateway
```

### 3. Database per Service Pattern

**Purpose**: Each microservice has its own database, ensuring loose coupling.

**Benefits for Retail ERP:**

- Independent scaling
- Technology diversity (SQL for orders, NoSQL for products)
- Data isolation and security
- Independent deployment

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

### 4. Saga Pattern

**Purpose**: Manage distributed transactions across multiple services.

**Critical for Retail ERP**: Order processing involves multiple services (inventory, payment, shipping).

**Two Approaches:**

**Choreography (Event-Driven):**

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

**Orchestration (Centralized):**

```mermaid
graph TB
    OrderSvc[Order Orchestrator]
    
    InventorySvc[Inventory Service]
    PaymentSvc[Payment Service]
    ShippingSvc[Shipping Service]
    
    OrderSvc -->|1. Reserve| InventorySvc
    OrderSvc -->|2. Charge| PaymentSvc
    OrderSvc -->|3. Ship| ShippingSvc
    
    PaymentSvc -.->|Rollback| InventorySvc
```

### 5. CQRS (Command Query Responsibility Segregation)

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

### 6. Event Sourcing Pattern

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
    EventStore[(Event Store<br/>All Events)]
    
    ReadModel1[(Order Read Model)]
    ReadModel2[(Analytics Model)]
    ReadModel3[(Audit Log)]
    
    OrderSvc -->|Events| EventStore
    EventStore --> ReadModel1
    EventStore --> ReadModel2
    EventStore --> ReadModel3
```

### 7. Circuit Breaker Pattern

**Purpose**: Prevent cascading failures by stopping requests to failing services.

**Critical for Retail ERP**: Payment service failure shouldn't crash the entire system.

**Diagram:**

```mermaid
stateDiagram-v2
    [*] --> Closed: Normal Operation
    Closed --> Open: Failure Threshold Reached
    Open --> HalfOpen: Timeout Expired
    HalfOpen --> Closed: Success
    HalfOpen --> Open: Failure
    Open --> [*]: Service Recovered
```

### 8. Bulkhead Pattern

**Purpose**: Isolate resources to prevent one service from consuming all resources.

**Benefits:**

- Payment processing isolated from reporting
- Critical services protected from non-critical ones

**Diagram:**

```mermaid
graph TB
    Gateway[API Gateway]
    
    Pool1[Thread Pool 1<br/>Payment Service]
    Pool2[Thread Pool 2<br/>Order Service]
    Pool3[Thread Pool 3<br/>Reporting Service]
    
    Gateway --> Pool1
    Gateway --> Pool2
    Gateway --> Pool3
    
    PaymentSvc[Payment Service]
    OrderSvc[Order Service]
    ReportSvc[Report Service]
    
    Pool1 --> PaymentSvc
    Pool2 --> OrderSvc
    Pool3 --> ReportSvc
```

### 9. Strangler Fig Pattern

**Purpose**: Gradually migrate from monolith to microservices by replacing features incrementally.

**Perfect for your migration strategy!**

**Diagram:**

```mermaid
graph TB
    Client[Client]
    Gateway[API Gateway]
    
    Monolith[Existing Monolith<br/>24_api]
    
    NewSvc1[New Product Service]
    NewSvc2[New Order Service]
    NewSvc3[New Payment Service]
    
    Client --> Gateway
    Gateway -->|Old Features| Monolith
    Gateway -->|New Features| NewSvc1
    Gateway -->|New Features| NewSvc2
    Gateway -->|New Features| NewSvc3
```

### 10. Backend for Frontend (BFF) Pattern

**Purpose**: Create separate backend services optimized for different client types.

**Benefits for Retail ERP:**

- Mobile app needs different data than web dashboard
- Admin panel vs customer app optimization

**Diagram:**

```mermaid
graph TB
    WebApp[Web Application]
    MobileApp[Mobile App]
    AdminPanel[Admin Panel]
    
    WebBFF[Web BFF]
    MobileBFF[Mobile BFF]
    AdminBFF[Admin BFF]
    
    Gateway[API Gateway]
    
    WebApp --> WebBFF
    MobileApp --> MobileBFF
    AdminPanel --> AdminBFF
    
    WebBFF --> Gateway
    MobileBFF --> Gateway
    AdminBFF --> Gateway
```

### 11. API Composition Pattern

**Purpose**: Aggregate data from multiple services for client requests.

**Example**: Order details page needs data from Order, Product, and Customer services.

**Diagram:**

```mermaid
graph TB
    Client[Client]
    Gateway[API Gateway]
    
    OrderSvc[Order Service]
    ProductSvc[Product Service]
    CustomerSvc[Customer Service]
    
    Client --> Gateway
    Gateway -->|Aggregate| OrderSvc
    Gateway -->|Aggregate| ProductSvc
    Gateway -->|Aggregate| CustomerSvc
```

### 12. Service Mesh Pattern

**Purpose**: Handle cross-cutting concerns (security, observability, traffic management) at infrastructure level.

**Benefits:**

- Centralized service-to-service communication
- Automatic mTLS
- Distributed tracing
- Load balancing

**Diagram:**

```mermaid
graph TB
    Service1[Product Service]
    Service2[Order Service]
    Service3[Payment Service]
    
    Sidecar1[Sidecar Proxy]
    Sidecar2[Sidecar Proxy]
    Sidecar3[Sidecar Proxy]
    
    ControlPlane[Service Mesh<br/>Control Plane<br/>Istio/Linkerd]
    
    Service1 <--> Sidecar1
    Service2 <--> Sidecar2
    Service3 <--> Sidecar3
    
    Sidecar1 <--> ControlPlane
    Sidecar2 <--> ControlPlane
    Sidecar3 <--> ControlPlane
```

## Proposed Microservice Architecture for Retail ERP

### Phase 1: Core Services (Priority)

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
        EventBus[Event Bus<br/>RabbitMQ/Kafka]
        Redis[Redis Cache]
        ServiceRegistry[Service Registry<br/>Consul/K8s]
    end
    
    subgraph Data Layer
        AuthDB[(Auth DB)]
        UserDB[(User DB)]
        ProductDB[(Product DB)]
        InventoryDB[(Inventory DB)]
        OrderDB[(Order DB)]
        PaymentDB[(Payment DB)]
        ShopDB[(Shop DB)]
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

### Service Boundaries & Responsibilities

1. **Auth Service**

   - Authentication (JWT tokens)
   - Authorization (RBAC)
   - Session management
   - OAuth integration

2. **User Service**

   - Customer profiles
   - Staff/Admin management
   - User preferences
   - Age verification

3. **Product Service**

   - Product catalog
   - Product attributes
   - Categories & tags
   - Product search (integrate with Elasticsearch)

4. **Inventory Service**

   - Stock levels
   - Warehouse management
   - RFID tracking
   - Stock movements
   - Low stock alerts

5. **Order Service**

   - Order creation
   - Order status management
   - Order history
   - Order orchestration (Saga)

6. **Payment Service**

   - Payment processing
   - Multiple payment gateways (SwishPay, D2IPay)
   - Refund processing
   - Payment reconciliation

7. **Shop Service**

   - Store information
   - Store configuration
   - Vending machine management (VM, VM20)
   - Store settings

8. **Campaign Service**

   - Promotional campaigns
   - Discount rules
   - Conditional pricing
   - Offer management

9. **Notification Service**

   - Email notifications
   - SMS notifications
   - Push notifications
   - In-app notifications

10. **Report Service**

    - Sales reports
    - Inventory reports
    - Financial reports
    - Custom report generation

11. **IoT Gateway Service**

    - Device management
    - Device communication (gRPC)
    - Device status monitoring
    - Fridge, TV, RFID device management

## Communication Patterns

### Synchronous Communication (REST/gRPC)

- **When to use**: Real-time operations (payment processing, inventory checks)
- **Services**: Order → Inventory, Order → Payment

### Asynchronous Communication (Events)

- **When to use**: Non-critical operations, eventual consistency
- **Services**: Order created → Notification, Inventory updated → Report update

### Event Flow Example: Order Processing

```mermaid
sequenceDiagram
    participant Client
    participant Gateway
    participant OrderSvc as Order Service
    participant InventorySvc as Inventory Service
    participant PaymentSvc as Payment Service
    participant NotificationSvc as Notification Service
    participant EventBus as Event Bus
    
    Client->>Gateway: POST /orders
    Gateway->>OrderSvc: Create Order
    OrderSvc->>InventorySvc: Reserve Inventory (gRPC)
    InventorySvc-->>OrderSvc: Inventory Reserved
    OrderSvc->>PaymentSvc: Process Payment (gRPC)
    PaymentSvc-->>OrderSvc: Payment Successful
    OrderSvc->>EventBus: OrderCreated Event
    OrderSvc-->>Gateway: Order Created
    Gateway-->>Client: 201 Created
    
    EventBus->>NotificationSvc: OrderCreated Event
    NotificationSvc->>Client: Send Confirmation Email
    
    EventBus->>ReportSvc: OrderCreated Event
    ReportSvc->>ReportDB: Update Sales Metrics
```

## Technology Stack Recommendations

### API Gateway

- **Kong** (Open source, plugin ecosystem)
- **AWS API Gateway** (If using AWS)
- **NGINX** (Lightweight option)

### Service Communication

- **REST**: Express.js, Fastify
- **gRPC**: Already in use for vm-service
- **Events**: RabbitMQ, Apache Kafka, AWS EventBridge

### Databases

- **DynamoDB**: Most services (Products, Inventory, Orders, Users, Shops, Campaigns) - using OneTable pattern
- **PostgreSQL**: Payment Service (ACID compliance for financial transactions)
- **Redis**: Caching, session storage
- **Elasticsearch**: Product search, analytics, reporting

### Service Discovery

- **Kubernetes DNS** (if using K8s)
- **Consul** (standalone)
- **AWS ECS Service Discovery** (if using AWS)

### Monitoring & Observability

- **Prometheus + Grafana**: Metrics
- **Jaeger/Zipkin**: Distributed tracing
- **ELK Stack**: Logging
- **Sentry**: Error tracking

### Container Orchestration

- **Kubernetes**: Production-grade orchestration
- **Docker Compose**: Development
- **AWS ECS/Fargate**: Managed alternative

## Detailed Technology Stack by Service

### Auth Service

- **Runtime**: Node.js 18+
- **Framework**: Express.js or Fastify
- **Database**: DynamoDB (OneTable pattern) - `auth-tokens`, `sessions`, `refresh-tokens`
- **Cache**: Redis (token blacklisting, session storage)
- **Auth Libraries**: JWT (jsonwebtoken), Passport.js
- **Validation**: Joi
- **Testing**: Jest, Supertest
- **Monitoring**: Winston logger, Prometheus metrics

### User Service

- **Runtime**: Node.js 18+
- **Framework**: Express.js or Fastify
- **Database**: DynamoDB (OneTable pattern) - `users`, `customers`, `staff`
- **Cache**: Redis (frequently accessed user data)
- **Search**: Elasticsearch (for user search if needed)
- **Validation**: Joi
- **Testing**: Jest, Supertest
- **Monitoring**: Winston logger, Prometheus metrics

### Product Service

- **Runtime**: Node.js 18+
- **Framework**: Express.js or Fastify
- **Database**: DynamoDB (OneTable pattern) - `products`, `categories`, `tags`
- **Search**: Elasticsearch (product search)
- **Cache**: Redis (product catalog caching)
- **Storage**: AWS S3 (product images)
- **Validation**: Joi
- **Testing**: Jest, Supertest
- **Monitoring**: Winston logger, Prometheus metrics

### Inventory Service

- **Runtime**: Node.js 18+
- **Framework**: Express.js or Fastify
- **Database**: DynamoDB (OneTable pattern) - `inventory`, `stock-movements`, `warehouses`
- **Cache**: Redis (real-time stock levels)
- **Message Queue**: RabbitMQ/Kafka (stock update events)
- **Validation**: Joi
- **Testing**: Jest, Supertest
- **Monitoring**: Winston logger, Prometheus metrics

### Order Service

- **Runtime**: Node.js 18+
- **Framework**: Express.js or Fastify
- **Database**: DynamoDB (OneTable pattern) - `orders`, `order-items`, `order-history`
- **Cache**: Redis (order status caching)
- **Message Queue**: RabbitMQ/Kafka (order events)
- **Saga Orchestration**: Custom implementation or Temporal
- **Validation**: Joi
- **Testing**: Jest, Supertest
- **Monitoring**: Winston logger, Prometheus metrics, Distributed tracing

### Payment Service

- **Runtime**: Node.js 18+
- **Framework**: Express.js or Fastify
- **Database**: PostgreSQL (ACID compliance) - `payments`, `refunds`, `payment_transactions`
- **Cache**: Redis (payment status caching)
- **Message Queue**: RabbitMQ/Kafka (payment events)
- **Security**: Encryption at rest, PCI DSS compliance, Tokenization
- **Validation**: Joi
- **Testing**: Jest, Supertest
- **Monitoring**: Winston logger, Prometheus metrics, Security audit logs

### Shop Service

- **Runtime**: Node.js 18+
- **Framework**: Express.js or Fastify
- **Database**: DynamoDB (OneTable pattern) - `shops`, `shop-settings`, `vending-machines`
- **Cache**: Redis (shop configuration caching)
- **gRPC**: @grpc/grpc-js (for vm-service communication)
- **Validation**: Joi
- **Testing**: Jest, Supertest
- **Monitoring**: Winston logger, Prometheus metrics

### Notification Service

- **Runtime**: Node.js 18+
- **Framework**: Express.js or Fastify
- **Database**: DynamoDB (OneTable pattern) - `notifications`, `notification-templates`, `notification-logs`
- **Email**: Nodemailer, AWS SES
- **SMS**: Twilio, AWS SNS
- **Push**: Firebase Cloud Messaging (FCM)
- **Message Queue**: RabbitMQ/Kafka (async notification processing)
- **Validation**: Joi
- **Testing**: Jest, Supertest
- **Monitoring**: Winston logger, Prometheus metrics

### Campaign Service

- **Runtime**: Node.js 18+
- **Framework**: Express.js or Fastify
- **Database**: DynamoDB (OneTable pattern) - `campaigns`, `offers`, `pricing-rules`
- **Cache**: Redis (active campaign caching)
- **Rule Engine**: Custom or Drools (complex pricing rules)
- **Validation**: Joi
- **Testing**: Jest, Supertest
- **Monitoring**: Winston logger, Prometheus metrics

### Report Service

- **Runtime**: Node.js 18+
- **Framework**: Express.js or Fastify
- **Database**: DynamoDB (report metadata), Elasticsearch (analytics), PostgreSQL (complex aggregations if needed)
- **Cache**: Redis (report caching)
- **Report Generation**: PDFKit/Puppeteer (PDF), ExcelJS (Excel)
- **Analytics**: Elasticsearch aggregations
- **Validation**: Joi
- **Testing**: Jest, Supertest
- **Monitoring**: Winston logger, Prometheus metrics

### IoT Gateway Service

- **Runtime**: Node.js 18+ or Go (better gRPC performance)
- **Framework**: Express.js (Node.js) or Gin (Go)
- **Database**: DynamoDB (OneTable pattern) - `devices`, `device-status`, `device-logs`
- **gRPC**: @grpc/grpc-js (Node.js) or native gRPC (Go)
- **Message Queue**: RabbitMQ/Kafka (device events)
- **Protocol**: MQTT (IoT device communication)
- **Validation**: Joi (Node.js) or validator (Go)
- **Testing**: Jest (Node.js) or Go testing
- **Monitoring**: Winston logger (Node.js), Prometheus metrics

## Migration Strategy (Strangler Fig Pattern)

### Phase 1: Extract Authentication (Weeks 1-2)

- Extract auth logic to separate service
- Keep existing API working
- Gradually migrate endpoints

### Phase 2: Extract Product & Inventory (Weeks 3-4)

- Most read-heavy services
- Easy to extract
- Immediate performance benefits

### Phase 3: Extract Order Service (Weeks 5-6)

- Most complex service
- Implement Saga pattern
- Critical for business

### Phase 4: Extract Payment Service (Weeks 7-8)

- High security requirements
- Isolate payment processing
- Implement circuit breaker

### Phase 5: Extract Supporting Services (Weeks 9-12)

- Campaign, Notification, Report services
- Less critical, can be done incrementally

## Cross-Industry Applicability

This architecture is adaptable to:

1. **E-commerce**: Same core services (Product, Order, Payment, Inventory)
2. **Healthcare**: Replace Shop with Clinic, add Patient Service
3. **Manufacturing**: Add Production Service, Supply Chain Service
4. **Hospitality**: Add Booking Service, Room Service
5. **Logistics**: Add Shipping Service, Route Optimization Service

**Key Adaptable Components:**

- API Gateway pattern (universal)
- Service discovery (all industries)
- Event-driven architecture (all industries)
- CQRS for reporting (all industries)

## Benefits Summary

### For Retail ERP

- **Scalability**: Scale inventory service during peak shopping seasons
- **Reliability**: Payment service failure doesn't crash entire system
- **Performance**: Optimized read models for dashboards
- **Maintainability**: Teams can work independently
- **Technology Diversity**: Use best tool for each service

### For Other Industries

- **Modularity**: Easy to add/remove services
- **Compliance**: Isolated services for regulatory requirements
- **Integration**: Easy to integrate with third-party services
- **Multi-tenancy**: Each service can handle multi-tenancy differently

## Implementation Files to Create

1. **Architecture Documentation**

   - `docs/architecture/microservices-overview.md`
   - `docs/architecture/service-boundaries.md`
   - `docs/architecture/communication-patterns.md`

2. **Service Definitions**

   - `services/auth-service/` (new)
   - `services/product-service/` (new)
   - `services/order-service/` (new)
   - `services/payment-service/` (new)
   - `services/inventory-service/` (new)

3. **Infrastructure**

   - `infrastructure/docker-compose.microservices.yml`
   - `infrastructure/kubernetes/` (if using K8s)
   - `infrastructure/api-gateway/` (Kong config)

4. **Shared Libraries**

   - `libs/shared/` (common utilities, types, events)

## Next Steps

1. **Review and approve** this architecture plan
2. **Set up development environment** with Docker Compose
3. **Start with Auth Service** extraction (lowest risk)
4. **Implement API Gateway** to route traffic
5. **Set up monitoring** before migration
6. **Gradually migrate** services using Strangler Fig pattern