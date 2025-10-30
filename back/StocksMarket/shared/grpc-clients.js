import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROTO_PATH = join(__dirname, '..', 'protos');

// Load proto files
const loadProto = (protoFile, packageName) => {
  const packageDefinition = protoLoader.loadSync(
    join(PROTO_PATH, protoFile),
    {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    }
  );
  return grpc.loadPackageDefinition(packageDefinition)[packageName];
};

// Create gRPC clients
export const createMarketClient = () => {
  const marketProto = loadProto('market.proto', 'market');
  return new marketProto.MarketService(
    `${config.marketService.host}:${config.marketService.port}`,
    grpc.credentials.createInsecure()
  );
};

export const createPriceClient = () => {
  const priceProto = loadProto('price.proto', 'price');
  return new priceProto.PriceService(
    `${config.priceService.host}:${config.priceService.port}`,
    grpc.credentials.createInsecure()
  );
};

export const createInvestorClient = () => {
  const investorProto = loadProto('investor.proto', 'investor');
  return new investorProto.InvestorService(
    `${config.investorService.host}:${config.investorService.port}`,
    grpc.credentials.createInsecure()
  );
};

export const createAnalyticsClient = () => {
  const analyticsProto = loadProto('analytics.proto', 'analytics');
  return new analyticsProto.AnalyticsService(
    `${config.analyticsService.host}:${config.analyticsService.port}`,
    grpc.credentials.createInsecure()
  );
};

export default {
  createMarketClient,
  createPriceClient,
  createInvestorClient,
  createAnalyticsClient
};

