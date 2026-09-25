import { logger } from '../../../shared/logger.js';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { SupervisorService } from '../orchestrator/supervisor.service.js';

export const GRPCServer = {
  start() {
    logger.info(`[gRPC Server] Initializing high-performance gRPC Supervisor Node...`);
    const packageDefinition = protoLoader.loadSync('src/app/modules/grpc/supervisor.proto', { keepCase: true });
    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    const supervisorProto = protoDescriptor.supervisor;

    const server = new grpc.Server();
    
    server.addService(supervisorProto.SupervisorNode.service, {
      RoutePrompt: async (call, callback) => {
        logger.info(`[gRPC Server] Received RPC RoutePrompt request.`);
        try {
          const result = await SupervisorService.routePrompt(call.request.prompt);
          callback(null, { success: true, route: result.route });
        } catch (err) {
          callback(err, null);
        }
      }
    });

    server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), (err, port) => {
      if (err) {
        logger.error(`[gRPC Server] Failed to bind: ${err.message}`);
        return;
      }
      server.start();
      logger.info(`[gRPC Server] Supervisor microservice listening on port ${port}`);
    });
  }
};
