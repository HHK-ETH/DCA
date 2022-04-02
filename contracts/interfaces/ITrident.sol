//SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.11;

import "./IBentobox.sol";

interface ITrident {
  struct Path {
    address pool;
    bytes data;
  }

  struct ExactInputParams {
    address tokenIn;
    uint256 amountIn;
    uint256 amountOutMinimum;
    Path[] path;
  }

  function bento() external returns (IBentoBox bento);

  function exactInput(ExactInputParams calldata params) external returns (uint256 amountOut);
}

interface IPool {
  function swap(bytes calldata data) external returns (uint256 amountOut);
}
