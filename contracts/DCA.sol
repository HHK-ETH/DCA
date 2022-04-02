//SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.11;

import "./interfaces/ITrident.sol";
import "./interfaces/IAggregatorInterface.sol";
import {Clone} from "clones-with-immutable-args/Clone.sol";

/// @title DCA
/// @author HHK-ETH
/// @notice Sustainable DCA vault using bentobox and trident
contract DCA is Clone {
  /// -----------------------------------------------------------------------
  /// Errors
  /// -----------------------------------------------------------------------
  error OwnerOnly();
  error ToClose();

  /// -----------------------------------------------------------------------
  /// Events
  /// -----------------------------------------------------------------------
  event ExecuteDCA(uint256 timestamp, uint256 amount);

  /// -----------------------------------------------------------------------
  /// Immutable variables
  /// -----------------------------------------------------------------------

  ///@notice address of the BentoBox
  function bentoBox() internal pure returns (IBentoBox _bentobox) {
    return IBentoBox(_getArgAddress(0));
  }

  ///@notice Address of the vault owner
  function owner() public pure returns (address _owner) {
    return _getArgAddress(20);
  }

  ///@notice Address of the token to sell
  function sellToken() public pure returns (address _sellToken) {
    return _getArgAddress(40);
  }

  ///@notice Address of the token to buy
  function buyToken() public pure returns (address _buyToken) {
    return _getArgAddress(60);
  }

  ///@notice Infos about the DCA
  ///@return _priceFeed Address of the priceFeed
  ///@return _epochDuration Minimum time between each buy
  ///@return _buyAmount Amount of token to use as swap input
  function dcaData()
    public
    pure
    returns (
      IAggregatorInterface _priceFeed,
      uint64 _epochDuration,
      uint256 _buyAmount
    )
  {
    return (IAggregatorInterface(_getArgAddress(80)), _getArgUint64(100), _getArgUint256(108));
  }

  /// -----------------------------------------------------------------------
  /// Mutable variables
  /// -----------------------------------------------------------------------

  ///@notice Store last buy timestamp
  uint256 public lastBuy;

  /// -----------------------------------------------------------------------
  /// State change functions
  /// -----------------------------------------------------------------------

  ///@notice Execute the DCA buy
  ///@param path Path to use when swapping on trident
  function executeDCA(ITrident.Path[] calldata path) external {
    (IAggregatorInterface priceFeed, uint64 epochDuration, uint256 buyAmount) = dcaData();
    IBentoBox bento = bentoBox();

    if (lastBuy + epochDuration > block.timestamp) {
      revert ToClose();
    }
    lastBuy = block.timestamp; //update lastBuy to make it non reentrant

    //only support 18 decimals tokens atm
    int256 price = priceFeed.latestAnswer();
    uint256 minAmount = ((buyAmount / (uint256(price) / (10**priceFeed.decimals()))) * 99) / 100;

    //execute the swap on trident
    bento.transfer(sellToken(), address(this), path[0].pool, buyAmount);
    for (uint256 i; i < path.length; ) {
      IPool(path[i].pool).swap(path[i].data);
      unchecked {
        ++i;
      }
    }

    //transfer minAmount to owner directly
    bento.transfer(buyToken(), address(this), owner(), bento.toShare(buyToken(), minAmount, false));
    //transfer remaining shares from owner to dca executor as a reward.
    bento.transfer(buyToken(), address(this), msg.sender, bento.balanceOf(buyToken(), address(this)));

    emit ExecuteDCA(lastBuy, minAmount);
  }

  ///@notice Allow the owner to withdraw its token from the vault
  function withdraw(uint256 _share) public {
    if (msg.sender != owner()) {
      revert OwnerOnly();
    }
    bentoBox().transfer(sellToken(), address(this), owner(), _share);
  }
}