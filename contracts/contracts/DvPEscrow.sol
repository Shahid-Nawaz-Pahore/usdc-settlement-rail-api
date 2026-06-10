// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @title DvPEscrow
 * @notice Minimal Delivery-vs-Payment escrow for a stablecoin settlement rail.
 *         A depositor funds a deal with USDC; the authorized `settler` releases
 *         it to the beneficiary only once the off-chain settlement condition is
 *         met (delivery confirmed → payment released). Funds are refundable to
 *         the depositor after the deadline (timeout) or if the settler cancels.
 *
 *         The rail's relayer is the `settler`: it never holds custody beyond the
 *         escrow, and release is conditional — that is the DvP guarantee.
 */
contract DvPEscrow {
    IERC20 public immutable token; // the settlement asset (USDC)
    address public immutable settler; // the rail operator authorized to release

    enum State {
        None,
        Funded,
        Released,
        Refunded
    }

    struct Deal {
        address depositor;
        address beneficiary;
        uint256 amount;
        uint64 deadline;
        State state;
    }

    mapping(bytes32 => Deal) public deals;

    event Funded(
        bytes32 indexed dealId,
        address indexed depositor,
        address indexed beneficiary,
        uint256 amount,
        uint64 deadline
    );
    event Released(bytes32 indexed dealId, address indexed beneficiary, uint256 amount);
    event Refunded(bytes32 indexed dealId, address indexed depositor, uint256 amount);

    error NotSettler();
    error BadState();
    error DeadlinePassed();
    error DeadlineNotReached();
    error ZeroAmount();
    error TransferFailed();

    constructor(address _token, address _settler) {
        token = IERC20(_token);
        settler = _settler;
    }

    modifier onlySettler() {
        if (msg.sender != settler) revert NotSettler();
        _;
    }

    /// @notice Fund a new deal. Caller must have approved `amount` to this contract.
    function fund(bytes32 dealId, address beneficiary, uint256 amount, uint64 deadline) external {
        if (amount == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert DeadlinePassed();
        Deal storage d = deals[dealId];
        if (d.state != State.None) revert BadState();

        d.depositor = msg.sender;
        d.beneficiary = beneficiary;
        d.amount = amount;
        d.deadline = deadline;
        d.state = State.Funded;

        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Funded(dealId, msg.sender, beneficiary, amount, deadline);
    }

    /// @notice Settler releases funds to the beneficiary (settlement condition met).
    function release(bytes32 dealId) external onlySettler {
        Deal storage d = deals[dealId];
        if (d.state != State.Funded) revert BadState();
        if (block.timestamp > d.deadline) revert DeadlinePassed();

        d.state = State.Released;
        if (!token.transfer(d.beneficiary, d.amount)) revert TransferFailed();
        emit Released(dealId, d.beneficiary, d.amount);
    }

    /// @notice Refund the depositor after the deadline (timeout). Permissionless.
    function refund(bytes32 dealId) external {
        Deal storage d = deals[dealId];
        if (d.state != State.Funded) revert BadState();
        if (block.timestamp <= d.deadline) revert DeadlineNotReached();

        d.state = State.Refunded;
        if (!token.transfer(d.depositor, d.amount)) revert TransferFailed();
        emit Refunded(dealId, d.depositor, d.amount);
    }

    /// @notice Settler cancels a funded deal before the deadline → refund depositor.
    function cancel(bytes32 dealId) external onlySettler {
        Deal storage d = deals[dealId];
        if (d.state != State.Funded) revert BadState();

        d.state = State.Refunded;
        if (!token.transfer(d.depositor, d.amount)) revert TransferFailed();
        emit Refunded(dealId, d.depositor, d.amount);
    }

    function getDeal(bytes32 dealId) external view returns (Deal memory) {
        return deals[dealId];
    }
}
