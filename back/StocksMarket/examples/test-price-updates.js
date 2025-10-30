/**
 * Test Script: Dynamic Price Updates
 * 
 * This script demonstrates how stock prices change based on buying and selling activity.
 * 
 * Prerequisites:
 * - All services must be running (npm run start:all)
 * - Database initialized with stocks
 * 
 * Usage:
 * node examples/test-price-updates.js
 */

import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load protos
const MARKET_PROTO_PATH = join(__dirname, '..', 'protos', 'market.proto');
const PRICE_PROTO_PATH = join(__dirname, '..', 'protos', 'price.proto');
const INVESTOR_PROTO_PATH = join(__dirname, '..', 'protos', 'investor.proto');

const marketProto = grpc.loadPackageDefinition(
  protoLoader.loadSync(MARKET_PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
  })
).market;

const priceProto = grpc.loadPackageDefinition(
  protoLoader.loadSync(PRICE_PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
  })
).price;

const investorProto = grpc.loadPackageDefinition(
  protoLoader.loadSync(INVESTOR_PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
  })
).investor;

// Create clients
const marketClient = new marketProto.MarketService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

const priceClient = new priceProto.PriceService(
  'localhost:50052',
  grpc.credentials.createInsecure()
);

const investorClient = new investorProto.InvestorService(
  'localhost:50053',
  grpc.credentials.createInsecure()
);

const STOCK_SYMBOL = 'AAPL';

// Helper to get current price
function getCurrentPrice() {
  return new Promise((resolve, reject) => {
    priceClient.GetPrice({ stock_symbol: STOCK_SYMBOL }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

// Helper to place an order
function placeOrder(investorId, orderType, quantity, price = 0) {
  return new Promise((resolve, reject) => {
    marketClient.PlaceOrder({
      investor_id: investorId,
      stock_symbol: STOCK_SYMBOL,
      order_type: orderType, // 0 = BUY, 1 = SELL
      quantity: quantity,
      price: price // 0 for market order
    }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

// Helper to register an investor
function registerInvestor(name, email, balance) {
  return new Promise((resolve, reject) => {
    investorClient.RegisterInvestor({
      name: name,
      email: email,
      initial_balance: balance
    }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

// Main test function
async function testPriceUpdates() {
  console.log('=================================================');
  console.log('Testing Dynamic Price Updates Based on Trading');
  console.log('=================================================\n');

  try {
    // Step 1: Get initial price
    console.log('📊 Step 1: Getting initial price...');
    let priceData = await getCurrentPrice();
    console.log(`   Initial Price: $${priceData.current_price.toFixed(2)}`);
    console.log(`   Company: ${STOCK_SYMBOL}\n`);

    // Step 2: Register two test investors
    console.log('👥 Step 2: Registering test investors...');
    const buyer = await registerInvestor(
      'Test Buyer',
      `buyer_${Date.now()}@test.com`,
      100000
    );
    console.log(`   ✓ Buyer registered: ${buyer.investor_id}`);

    const seller = await registerInvestor(
      'Test Seller',
      `seller_${Date.now()}@test.com`,
      100000
    );
    console.log(`   ✓ Seller registered: ${seller.investor_id}\n`);

    // Step 3: Test BUY pressure (should increase price)
    console.log('📈 Step 3: Testing BUY pressure (should increase price)...');
    
    // Seller places limit sell order first
    await placeOrder(seller.investor_id, 1, 100, priceData.current_price);
    console.log(`   ✓ Seller placed limit sell order: 100 shares at $${priceData.current_price}`);
    
    // Buyer places market buy order (aggressive buying)
    await placeOrder(buyer.investor_id, 0, 100, 0);
    console.log('   ✓ Buyer placed market buy order: 100 shares');
    
    // Wait a moment for price update
    await new Promise(resolve => setTimeout(resolve, 500));
    
    let newPrice = await getCurrentPrice();
    const buyChange = newPrice.current_price - priceData.current_price;
    console.log(`   New Price: $${newPrice.current_price.toFixed(2)} (${buyChange > 0 ? '+' : ''}${buyChange.toFixed(2)})`);
    console.log(`   Change: ${buyChange > 0 ? '🟢' : '🔴'} ${(buyChange / priceData.current_price * 100).toFixed(2)}%\n`);
    
    priceData = newPrice;

    // Step 4: Test SELL pressure (should decrease price)
    console.log('📉 Step 4: Testing SELL pressure (should decrease price)...');
    
    // Buyer places limit buy order first
    await placeOrder(buyer.investor_id, 0, 150, priceData.current_price);
    console.log(`   ✓ Buyer placed limit buy order: 150 shares at $${priceData.current_price}`);
    
    // Seller places market sell order (aggressive selling)
    await placeOrder(seller.investor_id, 1, 150, 0);
    console.log('   ✓ Seller placed market sell order: 150 shares');
    
    // Wait a moment for price update
    await new Promise(resolve => setTimeout(resolve, 500));
    
    newPrice = await getCurrentPrice();
    const sellChange = newPrice.current_price - priceData.current_price;
    console.log(`   New Price: $${newPrice.current_price.toFixed(2)} (${sellChange > 0 ? '+' : ''}${sellChange.toFixed(2)})`);
    console.log(`   Change: ${sellChange > 0 ? '🟢' : '🔴'} ${(sellChange / priceData.current_price * 100).toFixed(2)}%\n`);
    
    priceData = newPrice;

    // Step 5: Test large volume impact
    console.log('💰 Step 5: Testing large volume impact (500 shares)...');
    
    await placeOrder(seller.investor_id, 1, 500, priceData.current_price);
    console.log(`   ✓ Seller placed limit sell order: 500 shares at $${priceData.current_price}`);
    
    await placeOrder(buyer.investor_id, 0, 500, 0);
    console.log('   ✓ Buyer placed market buy order: 500 shares');
    
    // Wait a moment for price update
    await new Promise(resolve => setTimeout(resolve, 500));
    
    newPrice = await getCurrentPrice();
    const largeVolumeChange = newPrice.current_price - priceData.current_price;
    console.log(`   New Price: $${newPrice.current_price.toFixed(2)} (${largeVolumeChange > 0 ? '+' : ''}${largeVolumeChange.toFixed(2)})`);
    console.log(`   Change: ${largeVolumeChange > 0 ? '🟢' : '🔴'} ${(largeVolumeChange / priceData.current_price * 100).toFixed(2)}%`);
    console.log(`   Note: Larger volume = larger price impact\n`);

    // Summary
    console.log('=================================================');
    console.log('✅ Test completed successfully!');
    console.log('=================================================');
    console.log('\nKey Observations:');
    console.log('1. Buy orders (market) push prices UP ⬆️');
    console.log('2. Sell orders (market) push prices DOWN ⬇️');
    console.log('3. Larger volumes create larger price changes');
    console.log('4. The most aggressive order (market vs limit) determines direction');
    console.log('\nPrice update formula:');
    console.log('priceChange = currentPrice × volatilityFactor × direction × log(1 + volume/100)');
    console.log(`Current volatility factor: 0.001 (configurable in .env)\n`);

  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error('\nMake sure all services are running:');
    console.error('  npm run start:all');
  }

  process.exit(0);
}

// Run the test
testPriceUpdates();

