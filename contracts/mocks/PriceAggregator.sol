//SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.11;

contract PriceAggregator {
  uint256 public decimals;
  int256 public latestAnswer;

  constructor(uint256 _decimals) {
    decimals = _decimals;
  }

  function setLatestAnswer(int256 answer) public {
    latestAnswer = answer;
  }
}
