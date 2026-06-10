const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('DvPEscrow', function () {
  let token, escrow, settler, depositor, beneficiary, other;
  const dealId = ethers.id('deal-1');
  const amount = 1_000_000n; // 1 USDC (6 dp)

  beforeEach(async () => {
    [settler, depositor, beneficiary, other] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory('MockERC20');
    token = await Mock.deploy();
    const Escrow = await ethers.getContractFactory('DvPEscrow');
    escrow = await Escrow.deploy(await token.getAddress(), settler.address);
    await token.mint(depositor.address, amount * 10n);
    await token
      .connect(depositor)
      .approve(await escrow.getAddress(), amount * 10n);
  });

  async function fund(offset = 3600) {
    const deadline = (await time.latest()) + offset;
    await escrow
      .connect(depositor)
      .fund(dealId, beneficiary.address, amount, deadline);
    return deadline;
  }

  it('funds: pulls tokens and records the deal', async () => {
    await fund();
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(amount);
    const d = await escrow.getDeal(dealId);
    expect(d.state).to.equal(1); // Funded
    expect(d.beneficiary).to.equal(beneficiary.address);
  });

  it('settler releases to beneficiary (DvP)', async () => {
    await fund();
    await expect(escrow.connect(settler).release(dealId))
      .to.emit(escrow, 'Released')
      .withArgs(dealId, beneficiary.address, amount);
    expect(await token.balanceOf(beneficiary.address)).to.equal(amount);
  });

  it('non-settler cannot release', async () => {
    await fund();
    await expect(
      escrow.connect(other).release(dealId),
    ).to.be.revertedWithCustomError(escrow, 'NotSettler');
  });

  it('refunds the depositor after the deadline (timeout)', async () => {
    const deadline = await fund(100);
    await time.increaseTo(deadline + 1);
    await expect(escrow.refund(dealId))
      .to.emit(escrow, 'Refunded')
      .withArgs(dealId, depositor.address, amount);
    expect(await token.balanceOf(depositor.address)).to.equal(amount * 10n);
  });

  it('cannot refund before the deadline', async () => {
    await fund(3600);
    await expect(escrow.refund(dealId)).to.be.revertedWithCustomError(
      escrow,
      'DeadlineNotReached',
    );
  });

  it('settler can cancel before the deadline → refund', async () => {
    await fund(3600);
    await expect(escrow.connect(settler).cancel(dealId)).to.emit(
      escrow,
      'Refunded',
    );
    expect(await token.balanceOf(depositor.address)).to.equal(amount * 10n);
  });

  it('cannot release after the deadline', async () => {
    const deadline = await fund(100);
    await time.increaseTo(deadline + 1);
    await expect(
      escrow.connect(settler).release(dealId),
    ).to.be.revertedWithCustomError(escrow, 'DeadlinePassed');
  });

  it('cannot double-fund the same dealId', async () => {
    await fund();
    const deadline = (await time.latest()) + 3600;
    await expect(
      escrow
        .connect(depositor)
        .fund(dealId, beneficiary.address, amount, deadline),
    ).to.be.revertedWithCustomError(escrow, 'BadState');
  });
});
