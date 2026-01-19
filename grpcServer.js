const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const logger = require('../config/logger');
const shopService = require('../services/shop.service');
const productService = require('../services/product.service');

/**
 * gRPC Server for Store Service with mTLS
 * Implements the StoreService proto definition for VM service communication
 */
class GrpcServer {
  constructor() {
    this.server = null;
    this.packageDefinition = null;
    this.protoDescriptor = null;
  }

  /**
   * Load and parse the proto file
   */
  loadProto() {
    const protoPath = path.join(__dirname, '../proto/store.proto');
    
    if (!fs.existsSync(protoPath)) {
      throw new Error(`Proto file not found: ${protoPath}`);
    }

    this.packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    this.protoDescriptor = grpc.loadPackageDefinition(this.packageDefinition);
  }

  /**
   * Create TLS credentials for mTLS
   */
  createCredentials() {
    const { serverCertPath, serverKeyPath, caCertPath, requireClientCert } = config.grpc;

    // Check if certificate files exist
    if (!fs.existsSync(serverCertPath)) {
      throw new Error(`Server certificate not found: ${serverCertPath}`);
    }
    if (!fs.existsSync(serverKeyPath)) {
      throw new Error(`Server key not found: ${serverKeyPath}`);
    }
    if (!fs.existsSync(caCertPath)) {
      throw new Error(`CA certificate not found: ${caCertPath}`);
    }

    // Read certificate files (already returns Buffer)
    const serverCert = fs.readFileSync(serverCertPath);
    const serverKey = fs.readFileSync(serverKeyPath);
    const caCert = fs.readFileSync(caCertPath);

    // cert_chain must be a Buffer, not an array
    // If you have multiple certificates in a chain, concatenate them as a single Buffer
    const certChain = serverCert;
    const privateKey = serverKey;

    // Create CA certificate pool for client verification
    const rootCerts = caCert;

    // Create TLS credentials
    const credentials = grpc.ServerCredentials.createSsl(
      rootCerts,
      [
        {
          cert_chain: certChain,
          private_key: privateKey,
        },
      ],
      requireClientCert // Require client certificate (mTLS)
    );

    return credentials;
  }

  /**
   * Get environment from gRPC request metadata (headers)
   * Similar to HTTP API which uses 'env' header
   * Supports both 'env' and 'x-environment' for compatibility
   */
  getEnvironmentFromMetadata(call) {
    // Get metadata from the call
    const metadata = call.metadata;
    
    // Try 'env' first (matches HTTP API), then fallback to 'x-environment' for compatibility
    let envHeader = metadata.get('env');
    if (!envHeader || envHeader.length === 0) {
      envHeader = metadata.get('x-environment');
    }
    
    const env = envHeader && envHeader.length > 0 ? envHeader[0] : null;
    
    // Validate and normalize environment
    // Valid values: 'prod', 'master', 'demo' (default)
    if (env === 'prod' || env === 'master') {
      return env;
    }
    
    // Default to demo if not specified or invalid
    return 'demo';
  }

  /**
   * Verify store access implementation
   */
  async verifyStoreAccess(call, callback) {
    try {
      const { project_id, store_id } = call.request;

      if (!project_id || !store_id) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'project_id and store_id are required',
        });
      }

      // Get environment from request metadata (headers)
      const env = this.getEnvironmentFromMetadata(call);

      logger.info(`Verifying store access: project_id=${project_id}, store_id=${store_id}, env=${env}`);

      // Get shop by ID using environment from metadata
      const shop = await shopService.getShopById(env, store_id);

      if (!shop) {
        return callback(null, {
          has_access: false,
          message: `Store ${store_id} not found`,
          store_id,
          project_id,
        });
      }

      // Check if store is active
      if (shop.status === 'closed') {
        return callback(null, {
          has_access: false,
          message: `Store ${store_id} is closed`,
          store_id,
          project_id,
        });
      }

      // For now, we grant access if store exists and is active
      // You may want to add additional project_id validation here
      return callback(null, {
        has_access: true,
        message: 'Access granted',
        store_id,
        project_id,
      });
    } catch (error) {
      logger.error('Error verifying store access:', error);
      return callback({
        code: grpc.status.INTERNAL,
        message: `Internal error: ${error.message}`,
      });
    }
  }

  /**
   * Get store info implementation
   */
  async getStoreInfo(call, callback) {
    try {
      const { project_id, store_id } = call.request;

      if (!project_id || !store_id) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'project_id and store_id are required',
        });
      }

      // Get environment from request metadata (headers)
      const env = this.getEnvironmentFromMetadata(call);

      logger.info(`Getting store info: project_id=${project_id}, store_id=${store_id}, env=${env}`);

      // Get shop by ID using environment from metadata
      const shop = await shopService.getShopById(env, store_id);

      if (!shop) {
        return callback(null, {
          exists: false,
          store_id,
          name: '',
          environment: env,
          project_id,
          metadata: {},
          updated_at: 0,
        });
      }

      // Map shop data to response
      const metadata = {
        status: shop.status || '',
        address: shop.address || '',
        contact_no: shop.contact_no || '',
        shop_admin_email: shop.shop_admin_email || '',
        shopType: shop.shopType || 'store',
      };

      // Get updated_at timestamp
      const updatedAt = shop.updated_at 
        ? Math.floor(new Date(shop.updated_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000);

      return callback(null, {
        exists: true,
        store_id: shop.id || store_id,
        name: shop.name || '',
        environment: env,
        project_id,
        metadata,
        updated_at: updatedAt,
      });
    } catch (error) {
      logger.error('Error getting store info:', error);
      return callback({
        code: grpc.status.INTERNAL,
        message: `Internal error: ${error.message}`,
      });
    }
  }

  /**
   * Get product by stripe code implementation
   */
  async getProductByStripeCode(call, callback) {
    try {
      const { project_id, store_id, stripe_code } = call.request;

      if (!project_id || !store_id || !stripe_code) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'project_id, store_id, and stripe_code are required',
        });
      }

      // Get environment from request metadata (headers)
      const env = this.getEnvironmentFromMetadata(call);

      logger.info(`Getting product by stripe code: project_id=${project_id}, store_id=${store_id}, stripe_code=${stripe_code}, env=${env}`);

      // Verify store access first
      const shop = await shopService.getShopById(env, store_id);
      if (!shop) {
        return callback(null, {
          exists: false,
          stripe_code,
          title: '',
          category: '',
          picture: '',
          price: 0,
          purchase_price: 0,
          shop_id: store_id,
          _id: '',
          metadata: {},
        });
      }

      // Get product by stripe code using environment from metadata
      const product = await productService.getProductById2(env, store_id, stripe_code);

      if (!product) {
        logger.info(`Product not found: stripe_code=${stripe_code}, store_id=${store_id}, env=${env}`);
        return callback(null, {
          exists: false,
          stripe_code,
          title: '',
          category: '',
          picture: '',
          price: 0,
          purchase_price: 0,
          shop_id: store_id,
          _id: '',
          metadata: {},
        });
      }

      // Map product data to response
      // Convert product metadata to map<string, string> format
      const metadata = {};
      if (product.metadata && typeof product.metadata === 'object') {
        // Convert metadata object to string map
        for (const [key, value] of Object.entries(product.metadata)) {
          // Convert value to string (handle objects/arrays by stringifying)
          if (typeof value === 'object') {
            metadata[key] = JSON.stringify(value);
          } else {
            metadata[key] = String(value);
          }
        }
      }

      // Add additional product fields to metadata if needed
      if (product.units) metadata.units = String(product.units);
      if (product.isVending !== undefined) metadata.isVending = String(product.isVending);
      if (product.availableItems !== undefined) metadata.availableItems = String(product.availableItems);

      return callback(null, {
        exists: true,
        stripe_code: product.stripeCode || stripe_code,
        title: product.title || '',
        category: product.category || '',
        picture: product.picture || '',
        price: product.price || 0,
        purchase_price: product.purchasePrice || 0,
        shop_id: product.shopId || store_id,
        _id: product._id || product.id || '',
        metadata,
      });
    } catch (error) {
      logger.error('Error getting product by stripe code:', error);
      return callback({
        code: grpc.status.INTERNAL,
        message: `Internal error: ${error.message}`,
      });
    }
  }

  /**
   * Start the gRPC server
   */
  async start() {
    try {
      // Load proto file
      this.loadProto();

      // Create gRPC server
      this.server = new grpc.Server();

      // Get the store service from proto
      const storeProto = this.protoDescriptor.store;

      if (!storeProto || !storeProto.StoreService) {
        throw new Error('StoreService not found in proto definition');
      }

      // Add service implementation
      this.server.addService(storeProto.StoreService.service, {
        VerifyStoreAccess: this.verifyStoreAccess.bind(this),
        GetStoreInfo: this.getStoreInfo.bind(this),
        GetProductByStripeCode: this.getProductByStripeCode.bind(this),
      });

      // Create credentials
      const credentials = this.createCredentials();

      // Start server
      const port = config.grpc.port;
      const bindAddress = `0.0.0.0:${port}`;

      this.server.bindAsync(bindAddress, credentials, (error, port) => {
        if (error) {
          logger.error('Failed to start gRPC server:', error);
          throw error;
        }

        this.server.start();
        logger.info(`gRPC server started on port ${port} with mTLS`);
        logger.info(`Server certificate: ${config.grpc.serverCertPath}`);
        logger.info(`CA certificate: ${config.grpc.caCertPath}`);
        logger.info(`Client certificate required: ${config.grpc.requireClientCert}`);
      });
    } catch (error) {
      logger.error('Error starting gRPC server:', error);
      throw error;
    }
  }

  /**
   * Stop the gRPC server
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.tryShutdown(() => {
          logger.info('gRPC server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = GrpcServer;
