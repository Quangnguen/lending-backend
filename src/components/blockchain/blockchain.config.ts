import { registerAs } from '@nestjs/config';

export default registerAs('blockchain', () => ({
  rpcUrl: process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:7545',
  chainId: parseInt(process.env.BLOCKCHAIN_CHAIN_ID, 10) || 1337,
  p2pLendingAddress: process.env.P2P_LENDING_ADDRESS || '',
  mockUsdtAddress: process.env.MOCKUSDT_ADDRESS || '',
  priceOracleAddress: process.env.PRICE_ORACLE_ADDRESS || '',
  collateralManagerAddress: process.env.COLLATERAL_MANAGER_ADDRESS || '',
  // Cron intervals
  syncIntervalMinutes: 5,
  overdueCheckIntervalMinutes: 30,
}));
