# System Interaction Class Diagram

This diagram illustrates the communication and structure between VM Service, Order Service, and Payment Service based on the current codebase analysis.

## Service Communication Overview

1.  **VM Service -> Order Service**: 
    - **Protocol**: gRPC
    - **Purpose**: Verify payment status before dispensing products.
    - **Component**: [OrderVerificationService](file:///opt/homebrew/var/www/ERP/INDIA/vm-service/internal/services/order_verification.go#24-30) checks with `OrderService (gRPC)`.

2.  **Order Service -> Payment Service**:
    - **Protocol**: REST (HTTP)
    - **Purpose**: Process refunds.
    - **Component**: [OrderService](file:///opt/homebrew/var/www/ERP/INDIA/order-service/src/services/order.service.js#8-520) calls `Payment Service` API (`/v1/refunds/process`).

3.  **Razorpay Gateway -> Order Service**:
    - **Protocol**: Webhook (HTTP POST)
    - **Purpose**: Update payment status (e.g., Success/Failure).
    - **Component**: [Request](file:///opt/homebrew/var/www/ERP/INDIA/vm-service/internal/handlers/vm.go#796-844) -> `WebhookController` -> [OrderService](file:///opt/homebrew/var/www/ERP/INDIA/order-service/src/services/order.service.js#8-520).

```mermaid
classDiagram
    note "VM Service Logic"
    namespace VM_Service {
        class VMService_Backend {
            +SendDispenseCommand(selection, orderID)
        }
        class OrderVerificationService {
            +VerifyPaymentForDispense(orderID) bool
        }
    }

    note "Order Service Logic"
    namespace Order_Service {
        class GrpcServer {
            +VerifyPaymentForDispense(request)
        }
        class OrderService_Logic {
            +verifyPaymentForDispense(orderID)
            +processRefund(refundID)
            +updatePaymentInfo(paymentData)
        }
        class WebhookController {
            +handleRazorpayWebhook(req, res)
        }
    }

    note "Payment Service Logic"
    namespace Payment_Service {
        class RefundRoute {
            +processRefund(req, res)
        }
        class RazorpayService {
            +refundPayment(paymentId, amount)
            +createOrder(amount, currency)
        }
        class RazorpayController {
            +handleWebhook(req, res)
        }
    }

    %% Relationships
    VMService_Backend ..> OrderVerificationService : uses
    OrderVerificationService --|> GrpcServer : gRPC Call (Verify Payment)
    
    GrpcServer --> OrderService_Logic : delegates to

    OrderService_Logic --|> RefundRoute : HTTP POST /v1/refunds/process (Refunds)
    RefundRoute --> RazorpayService : uses
    
    WebhookController --> OrderService_Logic : updates payment status

    %% External Gateway
    class Razorpay_Gateway {
        <<External System>>
    }

    Razorpay_Gateway --|> WebhookController : HTTP POST (Payment Status Update)
    Razorpay_Gateway --|> RazorpayController : HTTP POST (Verification/Backup)
```

## Key Findings
- **VM Service**: Contains [OrderVerificationService](file:///opt/homebrew/var/www/ERP/INDIA/vm-service/internal/services/order_verification.go#24-30) to verify payments via gRPC, although the integration point in [SendDispenseCommand](file:///opt/homebrew/var/www/ERP/INDIA/vm-service/internal/services/vm_service.go#1027-1113) appears to be pending or implicit in the handler.
- **Order Service**: Acts as the central authority for Order Status. Receives webhooks directly from Razorpay to update payment status.
- **Payment Service**: Handles Razorpay interactions. It receives its own webhooks (logic pending) and accepts Refund requests from the Order Service.
