//SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.13;

import {ClonesWithImmutableArgs} from "clones-with-immutable-args/ClonesWithImmutableArgs.sol";
import "./DCA.sol";

/// @title DCA Factory
/// @author HHK-ETH
/// @notice Factory to create sustainable DCA vaults using bentobox and trident
contract DCAFactory {
  using ClonesWithImmutableArgs for address;

  /// -----------------------------------------------------------------------
  /// Events
  /// -----------------------------------------------------------------------
  event CreateDCA(DCA newVault, uint256 ok);

  /// -----------------------------------------------------------------------
  /// Immutable variables and constructor
  /// -----------------------------------------------------------------------
  DCA public immutable implementation;
  address public immutable bentobox;

  constructor(DCA _implementation, address _bentobox) {
    implementation = _implementation;
    bentobox = _bentobox;
  }

  /// -----------------------------------------------------------------------
  /// State change functions
  /// -----------------------------------------------------------------------

  ///@notice Deploy a new vault
  ///@param owner Address of the owner of the vault
  ///@param sellToken Address of the token to sell
  ///@param buyToken Address of the token to buy
  ///@param sellTokenPriceFeed Address of the priceFeed to use to determine sell token price
  ///@param buyTokenPriceFeed Address of the priceFeed to use to determine buy token price
  ///@param epochDuration Minimum time between each buy
  ///@param decimalsDiff buyToken decimals - sellToken decimals
  ///@param amount Amount to use on each buy
  ///@return newVault Vault address
  function createDCA(
    address owner,
    address sellToken,
    address buyToken,
    address sellTokenPriceFeed,
    address buyTokenPriceFeed,
    uint64 epochDuration,
    uint64 decimalsDiff,
    uint256 amount
  ) external returns (DCA newVault) {
    bytes memory data = abi.encodePacked(
      bentobox,
      owner,
      sellToken,
      buyToken,
      sellTokenPriceFeed,
      buyTokenPriceFeed,
      epochDuration,
      decimalsDiff,
      amount
    );
    newVault = DCA(address(implementation).clone(data));
    emit CreateDCA(newVault, 1);
  }
}
