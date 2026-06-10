const { ethers } = require('hardhat');
require('dotenv').config({ path: '../.env' });

// Deploys DvPEscrow on Sepolia with the operator as the authorized settler,
// bound to the configured USDC token.
async function main() {
  const usdc = process.env.USDC_CONTRACT_ADDRESS;
  if (!usdc) throw new Error('USDC_CONTRACT_ADDRESS not set');

  const [deployer] = await ethers.getSigners();
  console.log('Deployer / settler:', deployer.address);
  console.log('USDC token:', usdc);

  const Escrow = await ethers.getContractFactory('DvPEscrow');
  const escrow = await Escrow.deploy(usdc, deployer.address);
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log('DvPEscrow deployed at:', address);
  console.log('Set DVP_ESCROW_ADDRESS=' + address + ' in the backend .env');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
