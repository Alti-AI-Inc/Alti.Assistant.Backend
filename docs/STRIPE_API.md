# Stripe API Documentation

## Overview

The Stripe module provides comprehensive payment processing functionality including customer management, subscription handling, payment methods, and product management. All endpoints require authentication via the `auth()` middleware.

**Base URL**: `/api/stripe` (adjust based on your server configuration)

**Authentication**: All endpoints require a valid JWT token in the Authorization header.

---

## Table of Contents

1. [Customer Management](#customer-management)
2. [Product Management](#product-management)
3. [Payment Management](#payment-management)
4. [Subscription Management](#subscription-management)
5. [Error Handling](#error-handling)
6. [Response Structures](#response-structures)

---

## Customer Management

### List All Customers

Retrieves a list of all Stripe customers.

**Endpoint**: `GET /customers`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
```

**Query Parameters**: None

**Example Request**:

```bash
curl -X GET https://your-api.com/api/stripe/customers \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response**: `200 OK`

```json
{
  "accounts": {
    "object": "list",
    "data": [
      {
        "id": "cus_xxxxxxxxxxxxxxxx",
        "object": "customer",
        "address": null,
        "balance": 0,
        "created": 1704585600,
        "currency": null,
        "default_source": null,
        "delinquent": false,
        "description": null,
        "discount": null,
        "email": "user@example.com",
        "invoice_prefix": "XXXXXXX",
        "invoice_settings": {
          "custom_fields": null,
          "default_payment_method": null,
          "footer": null,
          "rendering_options": null
        },
        "livemode": false,
        "metadata": {},
        "name": "John Doe",
        "next_invoice_sequence": 1,
        "phone": null,
        "preferred_locales": [],
        "shipping": null,
        "tax_exempt": "none",
        "test_clock": null
      }
    ],
    "has_more": false,
    "url": "/v1/customers"
  }
}
```

---

### Create Customer

Creates a new Stripe customer using authenticated user information.

**Endpoint**: `POST /customer`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body**: None (uses authenticated user data)

**User Data Used**:

- `req.user.name` - Customer name
- `req.user.email` - Customer email

**Example Request**:

```bash
curl -X POST https://your-api.com/api/stripe/customer \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

**Response**: `201 Created`

```json
{
  "customer": {
    "id": "cus_xxxxxxxxxxxxxxxx",
    "object": "customer",
    "address": null,
    "balance": 0,
    "created": 1704585600,
    "currency": null,
    "default_source": null,
    "delinquent": false,
    "description": null,
    "discount": null,
    "email": "user@example.com",
    "invoice_prefix": "XXXXXXX",
    "invoice_settings": {
      "custom_fields": null,
      "default_payment_method": null,
      "footer": null,
      "rendering_options": null
    },
    "livemode": false,
    "metadata": {},
    "name": "John Doe",
    "next_invoice_sequence": 1,
    "phone": null,
    "preferred_locales": [],
    "shipping": null,
    "tax_exempt": "none",
    "test_clock": null
  }
}
```

---

### Get Customer

Retrieves a specific Stripe customer by ID.

**Endpoint**: `GET /customer/:customerId`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
```

**URL Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customerId` | string | Yes | Stripe customer ID (e.g., `cus_xxxxxxxxxxxxxxxx`) |

**Example Request**:

```bash
curl -X GET https://your-api.com/api/stripe/customer/cus_xxxxxxxxxxxxxxxx \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response**: `200 OK`

```json
{
  "customer": {
    "id": "cus_xxxxxxxxxxxxxxxx",
    "object": "customer",
    "address": null,
    "balance": 0,
    "created": 1704585600,
    "currency": null,
    "default_source": null,
    "delinquent": false,
    "description": null,
    "discount": null,
    "email": "user@example.com",
    "invoice_prefix": "XXXXXXX",
    "invoice_settings": {
      "custom_fields": null,
      "default_payment_method": "pm_xxxxxxxxxxxxxxxx",
      "footer": null,
      "rendering_options": null
    },
    "livemode": false,
    "metadata": {},
    "name": "John Doe",
    "next_invoice_sequence": 1,
    "phone": null,
    "preferred_locales": [],
    "shipping": null,
    "tax_exempt": "none",
    "test_clock": null
  }
}
```

---

### Update Customer

Updates an existing Stripe customer's information.

**Endpoint**: `PUT /customer/:customerId`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**URL Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customerId` | string | Yes | Stripe customer ID (e.g., `cus_xxxxxxxxxxxxxxxx`) |

**Request Body**:

```json
{
  "name": "Jane Doe",
  "email": "jane.doe@example.com",
  "phone": "+1234567890",
  "description": "Premium customer",
  "metadata": {
    "userId": "user_123",
    "tier": "premium"
  },
  "address": {
    "line1": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "postal_code": "94111",
    "country": "US"
  }
}
```

**Request Body Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | No | Customer's full name |
| `email` | string | No | Customer's email address |
| `phone` | string | No | Customer's phone number |
| `description` | string | No | Internal description |
| `metadata` | object | No | Set of key-value pairs for storing additional information |
| `address` | object | No | Customer's address |
| `shipping` | object | No | Customer's shipping information |

**Example Request**:

```bash
curl -X PUT https://your-api.com/api/stripe/customer/cus_xxxxxxxxxxxxxxxx \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "phone": "+1234567890"
  }'
```

**Response**: `200 OK`

```json
{
  "customer": {
    "id": "cus_xxxxxxxxxxxxxxxx",
    "object": "customer",
    "address": null,
    "balance": 0,
    "created": 1704585600,
    "currency": null,
    "default_source": null,
    "delinquent": false,
    "description": null,
    "discount": null,
    "email": "user@example.com",
    "invoice_prefix": "XXXXXXX",
    "invoice_settings": {
      "custom_fields": null,
      "default_payment_method": null,
      "footer": null,
      "rendering_options": null
    },
    "livemode": false,
    "metadata": {},
    "name": "Jane Doe",
    "next_invoice_sequence": 1,
    "phone": "+1234567890",
    "preferred_locales": [],
    "shipping": null,
    "tax_exempt": "none",
    "test_clock": null
  }
}
```

---

### Delete Customer

Permanently deletes a Stripe customer.

**Endpoint**: `DELETE /customer/:customerId`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
```

**URL Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customerId` | string | Yes | Stripe customer ID (e.g., `cus_xxxxxxxxxxxxxxxx`) |

**Example Request**:

```bash
curl -X DELETE https://your-api.com/api/stripe/customer/cus_xxxxxxxxxxxxxxxx \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response**: `200 OK`

```json
{
  "confirmation": {
    "id": "cus_xxxxxxxxxxxxxxxx",
    "object": "customer",
    "deleted": true
  }
}
```

---

## Product Management

### List All Products

Retrieves a list of all products from Stripe.

**Endpoint**: `GET /products`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
```

**Query Parameters**: None

**Example Request**:

```bash
curl -X GET https://your-api.com/api/stripe/products \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response**: `200 OK`

```json
{
  "products": {
    "object": "list",
    "data": [
      {
        "id": "prod_xxxxxxxxxxxxxxxx",
        "object": "product",
        "active": true,
        "created": 1704585600,
        "default_price": null,
        "description": "Up to 3 connectors • 100 GB storage",
        "images": [],
        "livemode": false,
        "metadata": {
          "plan_type": "Base",
          "plan_level": "base",
          "connectors_limit": "3",
          "storage_limit": "100 GB",
          "storage_limit_gb": "100"
        },
        "name": "Base Plan",
        "package_dimensions": null,
        "shippable": null,
        "statement_descriptor": null,
        "tax_code": null,
        "unit_label": null,
        "updated": 1704585600,
        "url": null
      },
      {
        "id": "prod_yyyyyyyyyyyyyyyy",
        "object": "product",
        "active": true,
        "created": 1704585600,
        "default_price": null,
        "description": "Up to 10 connectors • 500 GB storage",
        "images": [],
        "livemode": false,
        "metadata": {
          "plan_type": "Professional",
          "plan_level": "professional",
          "connectors_limit": "10",
          "storage_limit": "500 GB",
          "storage_limit_gb": "500"
        },
        "name": "Professional Plan",
        "package_dimensions": null,
        "shippable": null,
        "statement_descriptor": null,
        "tax_code": null,
        "unit_label": null,
        "updated": 1704585600,
        "url": null
      },
      {
        "id": "prod_zzzzzzzzzzzzzzzz",
        "object": "product",
        "active": true,
        "created": 1704585600,
        "default_price": null,
        "description": "Unlimited connectors • 1 TB+ storage",
        "images": [],
        "livemode": false,
        "metadata": {
          "plan_type": "Enterprise",
          "plan_level": "enterprise",
          "connectors_limit": "Unlimited",
          "storage_limit": "1 TB+",
          "storage_limit_gb": "1024",
          "storage_limit_plus": "true"
        },
        "name": "Enterprise Plan",
        "package_dimensions": null,
        "shippable": null,
        "statement_descriptor": null,
        "tax_code": null,
        "unit_label": null,
        "updated": 1704585600,
        "url": null
      }
    ],
    "has_more": false,
    "url": "/v1/products"
  }
}
```

---

### Create Products

Initializes all subscription products and their pricing tiers in Stripe. This endpoint creates three subscription plans (Base, Professional, Enterprise) with both monthly and yearly pricing options.

**Endpoint**: `POST /products`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body**: None

**Products Created**:

1. **Base Plan**

   - 3 connectors
   - 100 GB storage
   - Monthly: $99.00
   - Yearly: $1,009.80 (15% discount)

2. **Professional Plan**

   - 10 connectors
   - 500 GB storage
   - Monthly: $249.00
   - Yearly: $2,541.00 (15% discount)

3. **Enterprise Plan**
   - Unlimited connectors
   - 1 TB+ storage
   - Monthly: $499.00
   - Yearly: $5,089.80 (15% discount)

**Example Request**:

```bash
curl -X POST https://your-api.com/api/stripe/products \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

**Response**: `201 Created`

```json
{
  "message": "Products and prices created successfully"
}
```

**Note**: This endpoint:

- Deletes all existing products from the database (MongoDB)
- Creates new products in both Stripe and MongoDB
- Each product has metadata including plan level, connector limits, and storage limits
- Creates 6 total prices (3 products × 2 billing intervals)

---

### Get Product

Retrieves detailed information about a specific product from Stripe.

**Endpoint**: `GET /products/:productId`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
```

**URL Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `productId` | string | Yes | Stripe product ID (e.g., `prod_xxxxxxxxxxxxxxxx`) |

**Example Request**:

```bash
curl -X GET https://your-api.com/api/stripe/products/prod_xxxxxxxxxxxxxxxx \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response**: `200 OK`

```json
{
  "product": {
    "id": "prod_xxxxxxxxxxxxxxxx",
    "object": "product",
    "active": true,
    "created": 1704585600,
    "default_price": null,
    "description": "Up to 10 connectors • 500 GB storage",
    "images": [],
    "livemode": false,
    "metadata": {
      "plan_type": "Professional",
      "plan_level": "professional",
      "connectors_limit": "10",
      "storage_limit": "500 GB",
      "storage_limit_gb": "500"
    },
    "name": "Professional Plan",
    "package_dimensions": null,
    "shippable": null,
    "statement_descriptor": null,
    "tax_code": null,
    "unit_label": null,
    "updated": 1704585600,
    "url": null
  }
}
```

---

### List All Prices

Retrieves a list of all prices from Stripe, optionally filtered by product.

**Endpoint**: `GET /prices`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
```

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `productId` | string | No | Filter prices by product ID (e.g., `prod_xxxxxxxxxxxxxxxx`) |

**Example Request (All Prices)**:

```bash
curl -X GET https://your-api.com/api/stripe/prices \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Example Request (Filtered by Product)**:

```bash
curl -X GET "https://your-api.com/api/stripe/prices?productId=prod_xxxxxxxxxxxxxxxx" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response**: `200 OK`

```json
{
  "prices": {
    "object": "list",
    "data": [
      {
        "id": "price_xxxxxxxxxxxxxxxx",
        "object": "price",
        "active": true,
        "billing_scheme": "per_unit",
        "created": 1704585600,
        "currency": "usd",
        "custom_unit_amount": null,
        "livemode": false,
        "lookup_key": null,
        "metadata": {},
        "nickname": "Base Monthly",
        "product": "prod_xxxxxxxxxxxxxxxx",
        "recurring": {
          "aggregate_usage": null,
          "interval": "month",
          "interval_count": 1,
          "trial_period_days": null,
          "usage_type": "licensed"
        },
        "tax_behavior": "unspecified",
        "tiers_mode": null,
        "transform_quantity": null,
        "type": "recurring",
        "unit_amount": 9900,
        "unit_amount_decimal": "9900"
      },
      {
        "id": "price_yyyyyyyyyyyyyyyy",
        "object": "price",
        "active": true,
        "billing_scheme": "per_unit",
        "created": 1704585600,
        "currency": "usd",
        "custom_unit_amount": null,
        "livemode": false,
        "lookup_key": null,
        "metadata": {},
        "nickname": "Base Yearly",
        "product": "prod_xxxxxxxxxxxxxxxx",
        "recurring": {
          "aggregate_usage": null,
          "interval": "year",
          "interval_count": 1,
          "trial_period_days": null,
          "usage_type": "licensed"
        },
        "tax_behavior": "unspecified",
        "tiers_mode": null,
        "transform_quantity": null,
        "type": "recurring",
        "unit_amount": 100980,
        "unit_amount_decimal": "100980"
      },
      {
        "id": "price_zzzzzzzzzzzzzzzz",
        "object": "price",
        "active": true,
        "billing_scheme": "per_unit",
        "created": 1704585600,
        "currency": "usd",
        "custom_unit_amount": null,
        "livemode": false,
        "lookup_key": null,
        "metadata": {},
        "nickname": "Professional Monthly",
        "product": "prod_wwwwwwwwwwwwwwww",
        "recurring": {
          "aggregate_usage": null,
          "interval": "month",
          "interval_count": 1,
          "trial_period_days": null,
          "usage_type": "licensed"
        },
        "tax_behavior": "unspecified",
        "tiers_mode": null,
        "transform_quantity": null,
        "type": "recurring",
        "unit_amount": 24900,
        "unit_amount_decimal": "24900"
      },
      {
        "id": "price_aaaaaaaaaaaaaaaa",
        "object": "price",
        "active": true,
        "billing_scheme": "per_unit",
        "created": 1704585600,
        "currency": "usd",
        "custom_unit_amount": null,
        "livemode": false,
        "lookup_key": null,
        "metadata": {},
        "nickname": "Professional Yearly",
        "product": "prod_wwwwwwwwwwwwwwww",
        "recurring": {
          "aggregate_usage": null,
          "interval": "year",
          "interval_count": 1,
          "trial_period_days": null,
          "usage_type": "licensed"
        },
        "tax_behavior": "unspecified",
        "tiers_mode": null,
        "transform_quantity": null,
        "type": "recurring",
        "unit_amount": 254220,
        "unit_amount_decimal": "254220"
      },
      {
        "id": "price_bbbbbbbbbbbbbbbb",
        "object": "price",
        "active": true,
        "billing_scheme": "per_unit",
        "created": 1704585600,
        "currency": "usd",
        "custom_unit_amount": null,
        "livemode": false,
        "lookup_key": null,
        "metadata": {},
        "nickname": "Enterprise Monthly",
        "product": "prod_vvvvvvvvvvvvvvvv",
        "recurring": {
          "aggregate_usage": null,
          "interval": "month",
          "interval_count": 1,
          "trial_period_days": null,
          "usage_type": "licensed"
        },
        "tax_behavior": "unspecified",
        "tiers_mode": null,
        "transform_quantity": null,
        "type": "recurring",
        "unit_amount": 49900,
        "unit_amount_decimal": "49900"
      },
      {
        "id": "price_cccccccccccccccc",
        "object": "price",
        "active": true,
        "billing_scheme": "per_unit",
        "created": 1704585600,
        "currency": "usd",
        "custom_unit_amount": null,
        "livemode": false,
        "lookup_key": null,
        "metadata": {},
        "nickname": "Enterprise Yearly",
        "product": "prod_vvvvvvvvvvvvvvvv",
        "recurring": {
          "aggregate_usage": null,
          "interval": "year",
          "interval_count": 1,
          "trial_period_days": null,
          "usage_type": "licensed"
        },
        "tax_behavior": "unspecified",
        "tiers_mode": null,
        "transform_quantity": null,
        "type": "recurring",
        "unit_amount": 508860,
        "unit_amount_decimal": "508860"
      }
    ],
    "has_more": false,
    "url": "/v1/prices"
  }
}
```

**Use Cases**:

- Display all available pricing options in your UI
- Filter prices by product to show only relevant pricing tiers
- Get price IDs for creating subscriptions
  **Use Cases**:
- Display all available pricing options in your UI
- Filter prices by product to show only relevant pricing tiers
- Get price IDs for creating subscriptions
- Compare monthly vs yearly pricing

---

### List All Prices

Retrieves a list of all prices from Stripe, optionally filtered by product.

**Endpoint**: `GET /prices`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
```

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `productId` | string | No | Filter prices by product ID (e.g., `prod_xxxxxxxxxxxxxxxx`) |

**Example Request (All Prices)**:

```bash
curl -X GET https://your-api.com/api/stripe/prices \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Example Request (Filtered by Product)**:

```bash
curl -X GET "https://your-api.com/api/stripe/prices?productId=prod_xxxxxxxxxxxxxxxx" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response**: `200 OK`

```json
{
  "prices": {
    "object": "list",
    "data": [
      {
        "id": "price_xxxxxxxxxxxxxxxx",
        "object": "price",
        "active": true,
        "billing_scheme": "per_unit",
        "created": 1704585600,
        "currency": "usd",
        "custom_unit_amount": null,
        "livemode": false,
        "lookup_key": null,
        "metadata": {},
        "nickname": "Base Monthly",
        "product": "prod_xxxxxxxxxxxxxxxx",
        "recurring": {
          "aggregate_usage": null,
          "interval": "month",
          "interval_count": 1,
          "trial_period_days": null,
          "usage_type": "licensed"
        },
        "tax_behavior": "unspecified",
        "tiers_mode": null,
        "transform_quantity": null,
        "type": "recurring",
        "unit_amount": 9900,
        "unit_amount_decimal": "9900"
      },
      {
        "id": "price_yyyyyyyyyyyyyyyy",
        "object": "price",
        "active": true,
        "billing_scheme": "per_unit",
        "created": 1704585600,
        "currency": "usd",
        "custom_unit_amount": null,
        "livemode": false,
        "lookup_key": null,
        "metadata": {},
        "nickname": "Base Yearly",
        "product": "prod_xxxxxxxxxxxxxxxx",
        "recurring": {
          "aggregate_usage": null,
          "interval": "year",
          "interval_count": 1,
          "trial_period_days": null,
          "usage_type": "licensed"
        },
        "tax_behavior": "unspecified",
        "tiers_mode": null,
        "transform_quantity": null,
        "type": "recurring",
        "unit_amount": 100980,
        "unit_amount_decimal": "100980"
      },
      {
        "id": "price_zzzzzzzzzzzzzzzz",
        "object": "price",
        "active": true,
        "billing_scheme": "per_unit",
        "created": 1704585600,
        "currency": "usd",
        "custom_unit_amount": null,
        "livemode": false,
        "lookup_key": null,
        "metadata": {},
        "nickname": "Professional Monthly",
        "product": "prod_wwwwwwwwwwwwwwww",
        "recurring": {
          "aggregate_usage": null,
          "interval": "month",
          "interval_count": 1,
          "trial_period_days": null,
          "usage_type": "licensed"
        },
        "tax_behavior": "unspecified",
        "tiers_mode": null,
        "transform_quantity": null,
        "type": "recurring",
        "unit_amount": 24900,
        "unit_amount_decimal": "24900"
      },
      {
        "id": "price_aaaaaaaaaaaaaaaa",
        "object": "price",
        "active": true,
        "billing_scheme": "per_unit",
        "created": 1704585600,
        "currency": "usd",
        "custom_unit_amount": null,
        "livemode": false,
        "lookup_key": null,
        "metadata": {},
        "nickname": "Professional Yearly",
        "product": "prod_wwwwwwwwwwwwwwww",
        "recurring": {
          "aggregate_usage": null,
          "interval": "year",
          "interval_count": 1,
          "trial_period_days": null,
          "usage_type": "licensed"
        },
        "tax_behavior": "unspecified",
        "tiers_mode": null,
        "transform_quantity": null,
        "type": "recurring",
        "unit_amount": 254220,
        "unit_amount_decimal": "254220"
      },
      {
        "id": "price_bbbbbbbbbbbbbbbb",
        "object": "price",
        "active": true,
        "billing_scheme": "per_unit",
        "created": 1704585600,
        "currency": "usd",
        "custom_unit_amount": null,
        "livemode": false,
        "lookup_key": null,
        "metadata": {},
        "nickname": "Enterprise Monthly",
        "product": "prod_vvvvvvvvvvvvvvvv",
        "recurring": {
          "aggregate_usage": null,
          "interval": "month",
          "interval_count": 1,
          "trial_period_days": null,
          "usage_type": "licensed"
        },
        "tax_behavior": "unspecified",
        "tiers_mode": null,
        "transform_quantity": null,
        "type": "recurring",
        "unit_amount": 49900,
        "unit_amount_decimal": "49900"
      },
      {
        "id": "price_cccccccccccccccc",
        "object": "price",
        "active": true,
        "billing_scheme": "per_unit",
        "created": 1704585600,
        "currency": "usd",
        "custom_unit_amount": null,
        "livemode": false,
        "lookup_key": null,
        "metadata": {},
        "nickname": "Enterprise Yearly",
        "product": "prod_vvvvvvvvvvvvvvvv",
        "recurring": {
          "aggregate_usage": null,
          "interval": "year",
          "interval_count": 1,
          "trial_period_days": null,
          "usage_type": "licensed"
        },
        "tax_behavior": "unspecified",
        "tiers_mode": null,
        "transform_quantity": null,
        "type": "recurring",
        "unit_amount": 508860,
        "unit_amount_decimal": "508860"
      }
    ],
    "has_more": false,
    "url": "/v1/prices"
  }
}
```

**Use Cases**:

- Display all available pricing options in your UI
- Filter prices by product to show only relevant pricing tiers
- Get price IDs for creating subscriptions
- Compare monthly vs yearly pricing
- Build a dynamic pricing table

**Notes**:

- Returns 6 prices by default (3 products × 2 billing intervals each)
- When `productId` is provided, only returns prices for that specific product
- Use the returned price IDs when creating subscriptions
- The `unit_amount` is in cents (e.g., 9900 = $99.00)

---

## Payment Management

### Create Payment Intent

Creates a payment intent for one-time payments. The payment intent is automatically associated with the authenticated user's Stripe customer ID.

**Endpoint**: `POST /payment-intent`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body**:

```json
{
  "amount": 9900,
  "currency": "usd"
}
```

**Request Body Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `amount` | integer | Yes | Amount in cents (e.g., 9900 = $99.00) |
| `currency` | string | Yes | Three-letter ISO currency code (e.g., "usd", "eur", "gbp") |

**Example Request**:

```bash
curl -X POST https://your-api.com/api/stripe/payment-intent \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 9900,
    "currency": "usd"
  }'
```

**Response**: `201 Created`

```json
{
  "paymentIntent": {
    "clientSecret": "pi_xxxxxxxxxxxxx_secret_xxxxxxxxxxxxx"
  }
}
```

**Response Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `clientSecret` | string | Client secret to be used with Stripe.js to complete the payment |

**Usage**:
The `clientSecret` should be passed to the frontend where Stripe Elements can use it to confirm the payment:

```javascript
const result = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: { name: 'Customer Name' },
  },
});
```

---

### Add Payment Method

Attaches a payment method to the authenticated user's Stripe customer account and sets it as the default payment method for invoices.

**Endpoint**: `POST /payment-method`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body**:

```json
{
  "paymentMethodId": "pm_xxxxxxxxxxxxxxxx"
}
```

**Request Body Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `paymentMethodId` | string | Yes | Stripe payment method ID (e.g., `pm_xxxxxxxxxxxxxxxx`) |

**Example Request**:

```bash
curl -X POST https://your-api.com/api/stripe/payment-method \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    List All Subscriptions

Retrieves a list of all subscriptions from Stripe.

**Endpoint**: `GET /subscriptions`

**Authentication**: Required

**Headers**:
```

Authorization: Bearer <JWT_TOKEN>

````

**Query Parameters**: None

**Example Request**:
```bash
curl -X GET https://your-api.com/api/stripe/subscriptions \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
````

**Response**: `200 OK`

```json
{
  "subscriptions": {
    "object": "list",
    "data": [
      {
        "id": "sub_xxxxxxxxxxxxxxxx",
        "object": "subscription",
        "application": null,
        "application_fee_percent": null,
        "automatic_tax": {
          "enabled": false
        },
        "billing_cycle_anchor": 1704585600,
        "billing_thresholds": null,
        "cancel_at": null,
        "cancel_at_period_end": false,
        "canceled_at": null,
        "cancellation_details": {
          "comment": null,
          "feedback": null,
          "reason": null
        },
        "collection_method": "charge_automatically",
        "created": 1704585600,
        "currency": "usd",
        "current_period_end": 1707264000,
        "current_period_start": 1704585600,
        "customer": "cus_xxxxxxxxxxxxxxxx",
        "days_until_due": null,
        "default_payment_method": "pm_xxxxxxxxxxxxxxxx",
        "default_source": null,
        "default_tax_rates": [],
        "description": null,
        "discount": null,
        "ended_at": null,
        "items": {
          "object": "list",
          "data": [
            {
              "id": "si_xxxxxxxxxxxxxxxx",
              "object": "subscription_item",
              "billing_thresholds": null,
              "created": 1704585600,
              "metadata": {},
              "price": {
                "id": "price_xxxxxxxxxxxxxxxx",
                "object": "price",
                "active": true,
                "billing_scheme": "per_unit",
                "created": 1704585600,
                "currency": "usd",
                "nickname": "Professional Monthly",
                "product": "prod_xxxxxxxxxxxxxxxx",
                "recurring": {
                  "interval": "month",
                  "interval_count": 1,
                  "usage_type": "licensed"
                },
                "type": "recurring",
                "unit_amount": 24900
              },
              "quantity": 1,
              "subscription": "sub_xxxxxxxxxxxxxxxx",
              "tax_rates": []
            }
          ],
          "has_more": false,
          "total_count": 1
        },
        "latest_invoice": "in_xxxxxxxxxxxxxxxx",
        "livemode": false,
        "metadata": {},
        "status": "active"
      }
    ],
    "has_more": false,
    "url": "/v1/subscriptions"
  }
}
```

---

### Get Single Subscription

Retrieves detailed information about a specific subscription by ID.

**Endpoint**: `GET /subscription/:subscriptionId`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
```

**URL Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subscriptionId` | string | Yes | Stripe subscription ID (e.g., `sub_xxxxxxxxxxxxxxxx`) |

**Example Request**:

```bash
curl -X GET https://your-api.com/api/stripe/subscription/sub_xxxxxxxxxxxxxxxx \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response**: `200 OK`

```json
{
  "subscription": {
    "id": "sub_xxxxxxxxxxxxxxxx",
    "object": "subscription",
    "application": null,
    "application_fee_percent": null,
    "automatic_tax": {
      "enabled": false
    },
    "billing_cycle_anchor": 1704585600,
    "billing_thresholds": null,
    "cancel_at": null,
    "cancel_at_period_end": false,
    "canceled_at": null,
    "cancellation_details": {
      "comment": null,
      "feedback": null,
      "reason": null
    },
    "collection_method": "charge_automatically",
    "created": 1704585600,
    "currency": "usd",
    "current_period_end": 1707264000,
    "current_period_start": 1704585600,
    "customer": "cus_xxxxxxxxxxxxxxxx",
    "days_until_due": null,
    "default_payment_method": "pm_xxxxxxxxxxxxxxxx",
    "default_source": null,
    "default_tax_rates": [],
    "description": null,
    "discount": null,
    "ended_at": null,
    "items": {
      "object": "list",
      "data": [
        {
          "id": "si_xxxxxxxxxxxxxxxx",
          "object": "subscription_item",
          "billing_thresholds": null,
          "created": 1704585600,
          "metadata": {},
          "price": {
            "id": "price_xxxxxxxxxxxxxxxx",
            "object": "price",
            "active": true,
            "billing_scheme": "per_unit",
            "created": 1704585600,
            "currency": "usd",
            "custom_unit_amount": null,
            "livemode": false,
            "lookup_key": null,
            "metadata": {},
            "nickname": "Professional Monthly",
            "product": "prod_xxxxxxxxxxxxxxxx",
            "recurring": {
              "aggregate_usage": null,
              "interval": "month",
              "interval_count": 1,
              "trial_period_days": null,
              "usage_type": "licensed"
            },
            "tax_behavior": "unspecified",
            "tiers_mode": null,
            "transform_quantity": null,
            "type": "recurring",
            "unit_amount": 24900,
            "unit_amount_decimal": "24900"
          },
          "quantity": 1,
          "subscription": "sub_xxxxxxxxxxxxxxxx",
          "tax_rates": []
        }
      ],
      "has_more": false,
      "total_count": 1,
      "url": "/v1/subscription_items?subscription=sub_xxxxxxxxxxxxxxxx"
    },
    "latest_invoice": "in_xxxxxxxxxxxxxxxx",
    "livemode": false,
    "metadata": {},
    "next_pending_invoice_item_invoice": null,
    "on_behalf_of": null,
    "pause_collection": null,
    "payment_settings": {
      "payment_method_options": null,
      "payment_method_types": null,
      "save_default_payment_method": "off"
    },
    "pending_invoice_item_interval": null,
    "pending_setup_intent": null,
    "pending_update": null,
    "plan": null,
    "quantity": 1,
    "schedule": null,
    "start_date": 1704585600,
    "status": "active",
    "test_clock": null,
    "transfer_data": null,
    "trial_end": null,
    "trial_settings": {
      "end_behavior": {
        "missing_payment_method": "create_invoice"
      }
    },
    "trial_start": null
  }
}
```

---

### "paymentMethodId": "pm_xxxxxxxxxxxxxxxx"

}'

````

**Response**: `200 OK`
```json
{
  "paymentMethod": true
}
````

**What happens**:

1. The payment method is attached to the customer
2. The payment method is set as the default for future invoices
3. Returns `true` on success

**Obtaining a Payment Method ID**:
Payment method IDs are typically created on the frontend using Stripe.js:

```javascript
const { paymentMethod } = await stripe.createPaymentMethod({
  type: 'card',
  card: cardElement,
});
// Use paymentMethod.id to send to this endpoint
```

---

### List Payment Methods

Retrieves all payment methods associated with a customer.

**Endpoint**: `GET /payment-methods/:customerId/:type`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
```

**URL Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customerId` | string | Yes | Stripe customer ID (e.g., `cus_xxxxxxxxxxxxxxxx`) |
| `type` | string | Yes | Payment method type (currently only "card" is used in the service) |

**Note**: The `type` parameter is defined in the route but not currently utilized in the service implementation. The service always fetches card payment methods.

**Example Request**:

```bash
curl -X GET https://your-api.com/api/stripe/payment-methods/cus_xxxxxxxxxxxxxxxx/card \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response**: `200 OK`

```json
{
  "paymentMethods": [
    {
      "id": "pm_xxxxxxxxxxxxxxxx",
      "object": "payment_method",
      "billing_details": {
        "address": {
          "city": "San Francisco",
          "country": "US",
          "line1": "123 Main St",
          "line2": null,
          "postal_code": "94111",
          "state": "CA"
        },
        "email": "user@example.com",
        "name": "John Doe",
        "phone": "+1234567890"
      },
      "card": {
        "brand": "visa",
        "checks": {
          "address_line1_check": "pass",
          "address_postal_code_check": "pass",
          "cvc_check": "pass"
        },
        "country": "US",
        "exp_month": 12,
        "exp_year": 2025,
        "fingerprint": "xxxxxxxxxxxxxxxx",
        "funding": "credit",
        "generated_from": null,
        "last4": "4242",
        "networks": {
          "available": ["visa"],
          "preferred": null
        },
        "three_d_secure_usage": {
          "supported": true
        },
        "wallet": null
      },
      "created": 1704585600,
      "customer": "cus_xxxxxxxxxxxxxxxx",
      "livemode": false,
      "metadata": {},
      "type": "card"
    }
  ]
}
```

---

## Subscription Management

### Create Subscription

Creates a new subscription for a customer with a specific price plan.

**Endpoint**: `POST /subscription`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body**:

```json
{
  "customerId": "cus_xxxxxxxxxxxxxxxx",
  "priceId": "price_xxxxxxxxxxxxxxxx"
}
```

**Request Body Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customerId` | string | Yes | Stripe customer ID (e.g., `cus_xxxxxxxxxxxxxxxx`) |
| `priceId` | string | Yes | Stripe price ID (e.g., `price_xxxxxxxxxxxxxxxx`) |

**Example Request**:

```bash
curl -X POST https://your-api.com/api/stripe/subscription \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cus_xxxxxxxxxxxxxxxx",
    "priceId": "price_xxxxxxxxxxxxxxxx"
  }'
```

**Response**: `201 Created`

```json
{
  "subscription": {
    "id": "sub_xxxxxxxxxxxxxxxx",
    "object": "subscription",
    "application": null,
    "application_fee_percent": null,
    "automatic_tax": {
      "enabled": false
    },
    "billing_cycle_anchor": 1704585600,
    "billing_thresholds": null,
    "cancel_at": null,
    "cancel_at_period_end": false,
    "canceled_at": null,
    "cancellation_details": {
      "comment": null,
      "feedback": null,
      "reason": null
    },
    "collection_method": "charge_automatically",
    "created": 1704585600,
    "currency": "usd",
    "current_period_end": 1707264000,
    "current_period_start": 1704585600,
    "customer": "cus_xxxxxxxxxxxxxxxx",
    "days_until_due": null,
    "default_payment_method": "pm_xxxxxxxxxxxxxxxx",
    "default_source": null,
    "default_tax_rates": [],
    "description": null,
    "discount": null,
    "ended_at": null,
    "items": {
      "object": "list",
      "data": [
        {
          "id": "si_xxxxxxxxxxxxxxxx",
          "object": "subscription_item",
          "billing_thresholds": null,
          "created": 1704585600,
          "metadata": {},
          "price": {
            "id": "price_xxxxxxxxxxxxxxxx",
            "object": "price",
            "active": true,
            "billing_scheme": "per_unit",
            "created": 1704585600,
            "currency": "usd",
            "custom_unit_amount": null,
            "livemode": false,
            "lookup_key": null,
            "metadata": {},
            "nickname": "Professional Monthly",
            "product": "prod_xxxxxxxxxxxxxxxx",
            "recurring": {
              "aggregate_usage": null,
              "interval": "month",
              "interval_count": 1,
              "trial_period_days": null,
              "usage_type": "licensed"
            },
            "tax_behavior": "unspecified",
            "tiers_mode": null,
            "transform_quantity": null,
            "type": "recurring",
            "unit_amount": 24900,
            "unit_amount_decimal": "24900"
          },
          "quantity": 1,
          "subscription": "sub_xxxxxxxxxxxxxxxx",
          "tax_rates": []
        }
      ],
      "has_more": false,
      "total_count": 1,
      "url": "/v1/subscription_items?subscription=sub_xxxxxxxxxxxxxxxx"
    },
    "latest_invoice": {
      "id": "in_xxxxxxxxxxxxxxxx",
      "object": "invoice",
      "amount_due": 24900,
      "amount_paid": 24900,
      "amount_remaining": 0,
      "application": null,
      "attempt_count": 1,
      "attempted": true,
      "auto_advance": true,
      "automatic_tax": {
        "enabled": false,
        "status": null
      },
      "billing_reason": "subscription_create",
      "charge": "ch_xxxxxxxxxxxxxxxx",
      "collection_method": "charge_automatically",
      "created": 1704585600,
      "currency": "usd",
      "customer": "cus_xxxxxxxxxxxxxxxx",
      "customer_email": "user@example.com",
      "customer_name": "John Doe",
      "status": "paid",
      "payment_intent": {
        "id": "pi_xxxxxxxxxxxxxxxx",
        "object": "payment_intent",
        "amount": 24900,
        "amount_capturable": 0,
        "amount_received": 24900,
        "client_secret": "pi_xxxxxxxxxxxxx_secret_xxxxxxxxxxxxx",
        "confirmation_method": "automatic",
        "created": 1704585600,
        "currency": "usd",
        "customer": "cus_xxxxxxxxxxxxxxxx",
        "status": "succeeded"
      }
    },
    "livemode": false,
    "metadata": {},
    "next_pending_invoice_item_invoice": null,
    "on_behalf_of": null,
    "pause_collection": null,
    "payment_settings": {
      "payment_method_options": null,
      "payment_method_types": null,
      "save_default_payment_method": "off"
    },
    "pending_invoice_item_interval": null,
    "pending_setup_intent": null,
    "pending_update": null,
    "plan": null,
    "quantity": 1,
    "schedule": null,
    "start_date": 1704585600,
    "status": "active",
    "test_clock": null,
    "transfer_data": null,
    "trial_end": null,
    "trial_settings": {
      "end_behavior": {
        "missing_payment_method": "create_invoice"
      }
    },
    "trial_start": null
  }
}
```

**Important Fields**:
| Field | Description |
|-------|-------------|
| `id` | Subscription ID (use this for cancellation) |
| `status` | Subscription status (`active`, `past_due`, `canceled`, etc.) |
| `current_period_end` | Unix timestamp when the current period ends |
| `current_period_start` | Unix timestamp when the current period started |
| `latest_invoice` | Most recent invoice with payment intent details |
| `items.data[0].price` | Price details including amount and interval |

---

### Cancel Subscription

Cancels an active subscription immediately.

**Endpoint**: `DELETE /subscription/:subscriptionId`

**Authentication**: Required

**Headers**:

```
Authorization: Bearer <JWT_TOKEN>
```

**URL Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subscriptionId` | string | Yes | Stripe subscription ID (e.g., `sub_xxxxxxxxxxxxxxxx`) |

**Example Request**:

```bash
curl -X DELETE https://your-api.com/api/stripe/subscription/sub_xxxxxxxxxxxxxxxx \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response**: `200 OK`

```json
{
  "confirmation": {
    "id": "sub_xxxxxxxxxxxxxxxx",
    "object": "subscription",
    "application": null,
    "application_fee_percent": null,
    "automatic_tax": {
      "enabled": false
    },
    "billing_cycle_anchor": 1704585600,
    "billing_thresholds": null,
    "cancel_at": null,
    "cancel_at_period_end": false,
    "canceled_at": 1704672000,
    "cancellation_details": {
      "comment": null,
      "feedback": null,
      "reason": null
    },
    "collection_method": "charge_automatically",
    "created": 1704585600,
    "currency": "usd",
    "current_period_end": 1707264000,
    "current_period_start": 1704585600,
    "customer": "cus_xxxxxxxxxxxxxxxx",
    "days_until_due": null,
    "default_payment_method": "pm_xxxxxxxxxxxxxxxx",
    "default_source": null,
    "default_tax_rates": [],
    "description": null,
    "discount": null,
    "ended_at": 1704672000,
    "items": {
      "object": "list",
      "data": [
        {
          "id": "si_xxxxxxxxxxxxxxxx",
          "object": "subscription_item",
          "billing_thresholds": null,
          "created": 1704585600,
          "metadata": {},
          "price": {
            "id": "price_xxxxxxxxxxxxxxxx",
            "object": "price",
            "active": true,
            "billing_scheme": "per_unit",
            "created": 1704585600,
            "currency": "usd",
            "custom_unit_amount": null,
            "livemode": false,
            "lookup_key": null,
            "metadata": {},
            "nickname": "Professional Monthly",
            "product": "prod_xxxxxxxxxxxxxxxx",
            "recurring": {
              "aggregate_usage": null,
              "interval": "month",
              "interval_count": 1,
              "trial_period_days": null,
              "usage_type": "licensed"
            },
            "tax_behavior": "unspecified",
            "tiers_mode": null,
            "transform_quantity": null,
            "type": "recurring",
            "unit_amount": 24900,
            "unit_amount_decimal": "24900"
          },
          "quantity": 1,
          "subscription": "sub_xxxxxxxxxxxxxxxx",
          "tax_rates": []
        }
      ],
      "has_more": false,
      "total_count": 1,
      "url": "/v1/subscription_items?subscription=sub_xxxxxxxxxxxxxxxx"
    },
    "latest_invoice": "in_xxxxxxxxxxxxxxxx",
    "livemode": false,
    "metadata": {},
    "next_pending_invoice_item_invoice": null,
    "on_behalf_of": null,
    "pause_collection": null,
    "payment_settings": {
      "payment_method_options": null,
      "payment_method_types": null,
      "save_default_payment_method": "off"
    },
    "pending_invoice_item_interval": null,
    "pending_setup_intent": null,
    "pending_update": null,
    "plan": null,
    "quantity": 1,
    "schedule": null,
    "start_date": 1704585600,
    "status": "canceled",
    "test_clock": null,
    "transfer_data": null,
    "trial_end": null,
    "trial_settings": {
      "end_behavior": {
        "missing_payment_method": "create_invoice"
      }
    },
    "trial_start": null
  }
}
```

**Key Changes After Cancellation**:

- `status` changes to `"canceled"`
- `canceled_at` timestamp is set
- `ended_at` timestamp is set

---

## Error Handling

All endpoints use a consistent error handling pattern via the `catchAsync` wrapper. Errors are returned in the following format:

### Error Response Structure

**Status Codes**:

- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (missing or invalid authentication)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error (Stripe API errors, server errors)

**Error Response Format**:

```json
{
  "error": {
    "type": "StripeInvalidRequestError",
    "message": "No such customer: 'cus_invalid'",
    "statusCode": 404,
    "raw": {
      "code": "resource_missing",
      "doc_url": "https://stripe.com/docs/error-codes/resource-missing",
      "message": "No such customer: 'cus_invalid'",
      "param": "customer",
      "request_log_url": "https://dashboard.stripe.com/test/logs/req_xxx",
      "type": "invalid_request_error"
    }
  }
}
```

### Common Error Scenarios

#### 1. Invalid Customer ID

```json
{
  "error": {
    "type": "StripeInvalidRequestError",
    "message": "No such customer: 'cus_invalid'",
    "statusCode": 404
  }
}
```

#### 2. Missing Authentication Token

```json
{
  "error": {
    "message": "Unauthorized",
    "statusCode": 401
  }
}
```

#### 3. Invalid Payment Method

```json
{
  "error": {
    "type": "StripeInvalidRequestError",
    "message": "No such payment_method: 'pm_invalid'",
    "statusCode": 404
  }
}
```

#### 4. Insufficient Funds

```json
{
  "error": {
    "type": "StripeCardError",
    "message": "Your card has insufficient funds.",
    "statusCode": 402,
    "raw": {
      "code": "card_declined",
      "decline_code": "insufficient_funds",
      "type": "card_error"
    }
  }
}
```

#### 5. Missing Required Fields

```json
{
  "error": {
    "message": "amount is required",
    "statusCode": 400
  }
}
```

---

## Response Structures

### Customer Object

```typescript
{
  id: string;                    // Unique identifier (e.g., "cus_xxx")
  object: "customer";
  address: Address | null;       // Customer's address
  balance: number;               // Current balance in cents
  created: number;               // Unix timestamp
  currency: string | null;       // Three-letter ISO code
  default_source: string | null; // ID of default payment source
  delinquent: boolean;          // Whether customer has outstanding balance
  description: string | null;    // Internal description
  discount: Discount | null;     // Active discount
  email: string;                // Customer's email
  invoice_prefix: string;       // Prefix for invoice numbers
  invoice_settings: {
    custom_fields: any | null;
    default_payment_method: string | null;
    footer: string | null;
    rendering_options: any | null;
  };
  livemode: boolean;            // true for production, false for test
  metadata: Record<string, string>; // Key-value pairs
  name: string;                 // Customer's full name
  next_invoice_sequence: number;
  phone: string | null;         // Customer's phone
  preferred_locales: string[];  // Preferred languages
  shipping: Shipping | null;    // Shipping information
  tax_exempt: "none" | "exempt" | "reverse";
  test_clock: string | null;
}
```

### Product Object

```typescript
{
  id: string;                   // Unique identifier (e.g., "prod_xxx")
  object: "product";
  active: boolean;              // Whether product can be purchased
  created: number;              // Unix timestamp
  default_price: string | null; // ID of default price
  description: string;          // Product description
  images: string[];             // Array of image URLs
  livemode: boolean;
  metadata: {
    plan_type: string;          // e.g., "Professional"
    plan_level: string;         // e.g., "professional"
    connectors_limit: string;   // e.g., "10"
    storage_limit: string;      // e.g., "500 GB"
    storage_limit_gb: string;   // e.g., "500"
  };
  name: string;                 // Product name
  package_dimensions: any | null;
  shippable: boolean | null;
  statement_descriptor: string | null;
  tax_code: string | null;
  unit_label: string | null;
  updated: number;              // Unix timestamp
  url: string | null;
}
```

### Price Object

```typescript
{
  id: string; // Unique identifier (e.g., "price_xxx")
  object: 'price';
  active: boolean;
  billing_scheme: 'per_unit' | 'tiered';
  created: number; // Unix timestamp
  currency: string; // Three-letter ISO code
  custom_unit_amount: any | null;
  livemode: boolean;
  lookup_key: string | null;
  metadata: Record<string, string>;
  nickname: string; // e.g., "Professional Monthly"
  product: string; // Product ID
  recurring: {
    aggregate_usage: string | null;
    interval: 'day' | 'week' | 'month' | 'year';
    interval_count: number;
    trial_period_days: number | null;
    usage_type: 'licensed' | 'metered';
  }
  tax_behavior: string;
  tiers_mode: string | null;
  transform_quantity: any | null;
  type: 'one_time' | 'recurring';
  unit_amount: number; // Amount in cents
  unit_amount_decimal: string; // Decimal string representation
}
```

### Payment Method Object

```typescript
{
  id: string;                   // Unique identifier (e.g., "pm_xxx")
  object: "payment_method";
  billing_details: {
    address: {
      city: string | null;
      country: string | null;
      line1: string | null;
      line2: string | null;
      postal_code: string | null;
      state: string | null;
    };
    email: string | null;
    name: string | null;
    phone: string | null;
  };
  card: {
    brand: "visa" | "mastercard" | "amex" | "discover" | string;
    checks: {
      address_line1_check: "pass" | "fail" | "unavailable" | null;
      address_postal_code_check: "pass" | "fail" | "unavailable" | null;
      cvc_check: "pass" | "fail" | "unavailable" | null;
    };
    country: string;            // Two-letter country code
    exp_month: number;          // 1-12
    exp_year: number;           // Four digits
    fingerprint: string;        // Unique identifier for the card
    funding: "credit" | "debit" | "prepaid" | "unknown";
    generated_from: any | null;
    last4: string;              // Last 4 digits
    networks: {
      available: string[];
      preferred: string | null;
    };
    three_d_secure_usage: {
      supported: boolean;
    };
    wallet: any | null;
  };
  created: number;              // Unix timestamp
  customer: string | null;      // Customer ID
  livemode: boolean;
  metadata: Record<string, string>;
  type: "card" | "us_bank_account" | string;
}
```

### Subscription Object

```typescript
{
  id: string;                   // Unique identifier (e.g., "sub_xxx")
  object: "subscription";
  application: string | null;
  application_fee_percent: number | null;
  automatic_tax: {
    enabled: boolean;
  };
  billing_cycle_anchor: number; // Unix timestamp
  billing_thresholds: any | null;
  cancel_at: number | null;     // Unix timestamp
  cancel_at_period_end: boolean;
  canceled_at: number | null;   // Unix timestamp
  cancellation_details: {
    comment: string | null;
    feedback: string | null;
    reason: string | null;
  };
  collection_method: "charge_automatically" | "send_invoice";
  created: number;              // Unix timestamp
  currency: string;             // Three-letter ISO code
  current_period_end: number;   // Unix timestamp
  current_period_start: number; // Unix timestamp
  customer: string;             // Customer ID
  days_until_due: number | null;
  default_payment_method: string | null;
  default_source: string | null;
  default_tax_rates: any[];
  description: string | null;
  discount: any | null;
  ended_at: number | null;      // Unix timestamp
  items: {
    object: "list";
    data: SubscriptionItem[];
    has_more: boolean;
    total_count: number;
    url: string;
  };
  latest_invoice: Invoice | string;
  livemode: boolean;
  metadata: Record<string, string>;
  next_pending_invoice_item_invoice: string | null;
  on_behalf_of: string | null;
  pause_collection: any | null;
  payment_settings: {
    payment_method_options: any | null;
    payment_method_types: string[] | null;
    save_default_payment_method: "off" | "on_subscription";
  };
  pending_invoice_item_interval: any | null;
  pending_setup_intent: string | null;
  pending_update: any | null;
  plan: any | null;
  quantity: number;
  schedule: string | null;
  start_date: number;           // Unix timestamp
  status: "incomplete" | "incomplete_expired" | "trialing" | "active" | "past_due" | "canceled" | "unpaid";
  test_clock: string | null;
  transfer_data: any | null;
  trial_end: number | null;     // Unix timestamp
  trial_settings: {
    end_behavior: {
      missing_payment_method: "create_invoice" | "cancel" | "pause";
    };
  };
  trial_start: number | null;   // Unix timestamp
}
```

---

## Integration Examples

### Complete Subscription Flow

#### Step 1: Create Customer

```bash
POST /api/stripe/customer
Authorization: Bearer <token>
```

#### Step 2: Get Available Products

```bash
GET /api/stripe/products
Authorization: Bearer <token>
```

Response will include all available plans with their price IDs.

#### Step 3: Add Payment Method

```bash
POST /api/stripe/payment-method
Authorization: Bearer <token>
Content-Type: application/json

{
  "paymentMethodId": "pm_xxxxxxxxxxxxxxxx"
}
```

#### Step 4: Create Subscription

```bash
POST /api/stripe/subscription
Authorization: Bearer <token>
Content-Type: application/json

{
  "customerId": "cus_xxxxxxxxxxxxxxxx",
  "priceId": "price_xxxxxxxxxxxxxxxx"
}
```

### One-Time Payment Flow

#### Step 1: Create Customer (if needed)

```bash
POST /api/stripe/customer
Authorization: Bearer <token>
```

#### Step 2: Create Payment Intent

```bash
POST /api/stripe/payment-intent
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 9900,
  "currency": "usd"
}
```

#### Step 3: Confirm Payment (Frontend)

Use the returned `clientSecret` with Stripe.js:

```javascript
const result = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: { name: 'Customer Name' },
  },
});
```

---

## Configuration

### Required Environment Variables

```env
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxx
```

This is configured in `config/index.js`:

```javascript
stripe: {
  stripe_secret_key: process.env.STRIPE_SECRET_KEY;
}
```

### Stripe API Version

The module uses Stripe API version `2022-11-15`. This is hardcoded in all service files.

---

## Security Considerations

1. **Authentication**: All endpoints require valid JWT authentication
2. **User Context**: Customer operations use `req.user` data to ensure users can only access their own resources
3. **Secret Keys**: Never expose Stripe secret keys to the frontend
4. **Client Secrets**: Payment intent client secrets should be handled securely and only sent to authenticated users
5. **Webhooks**: Consider implementing webhook handlers for:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

---

## Database Schema

### Products Model (MongoDB)

```javascript
{
  name: String (required),
  description: String (required),
  metadata: {
    connectors_limit: String (required),
    storage_limit_gb: String (required),
    plan_level: String (required)
  },
  prices: [{
    nickname: String (required),
    unit_amount: Number (required),
    interval: String (required)
  }],
  stripe_product_id: String (required)
}
```

### User Model Reference

Users should have a `stripeAccountId` field to link with Stripe customers:

```javascript
{
  stripeAccountId: String; // Stripe customer ID
}
```

---

## Testing

### Test Mode

When using test mode (`livemode: false`), use test API keys:

- Secret Key: `sk_test_...`
- Publishable Key: `pk_test_...`

### Test Cards

Use these test card numbers for different scenarios:

| Card Number         | Scenario                          |
| ------------------- | --------------------------------- |
| 4242 4242 4242 4242 | Success                           |
| 4000 0000 0000 0002 | Declined                          |
| 4000 0000 0000 9995 | Insufficient funds                |
| 4000 0025 0000 3155 | 3D Secure authentication required |

**Expiration Date**: Any future date  
**CVC**: Any 3 digits  
**ZIP**: Any 5 digits

---

## Postman Collection

The module includes Postman collections for testing. Look for Stripe-related collections in the `postman_collections/` directory.

---

## Support & Resources

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [Stripe Dashboard](https://dashboard.stripe.com/)
- [Stripe API Changelog](https://stripe.com/docs/upgrades)

---

## Changelog

**Version**: 1.0.0  
**API Version**: 2022-11-15  
**Last Updated**: January 6, 2026

---

## Notes

1. The `type` parameter in `GET /payment-methods/:customerId/:type` is currently not utilized in the service layer
2. The `createProductService` endpoint deletes all existing products in MongoDB before creating new ones
3. Payment intents are created with `automatic_payment_methods: { enabled: false }` requiring explicit payment method handling
4. Yearly subscriptions automatically include a 15% discount
5. Consider implementing webhook handlers for production use
6. The module does not currently support trial periods, but this can be added via the `trial_period_days` parameter in subscriptions
