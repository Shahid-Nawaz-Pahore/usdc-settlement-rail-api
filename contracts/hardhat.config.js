require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
// Reuse the backend .env for the Sepolia RPC + operator key.
require('dotenv').config({ path: '../.env' });

const RPC = process.env.RPC_HTTP_URL || '';
const RAW = process.env.OPERATOR_PRIVATE_KEY || '';
const KEY = RAW ? [RAW.startsWith('0x') ? RAW : '0x' + RAW] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    sepolia: { url: RPC, accounts: KEY },
  },
};
