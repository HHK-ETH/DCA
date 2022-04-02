//SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.11;

import "@rari-capital/solmate/src/tokens/ERC20.sol";

contract Token is ERC20 {
  constructor(
    string memory name,
    string memory symbol,
    uint8 decimals,
    uint256 amount
  ) ERC20(name, symbol, decimals) {
    _mint(msg.sender, amount);
  }
}
