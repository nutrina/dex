// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;
pragma experimental ABIEncoderV2;

import "./Wallet.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract Dex is Wallet {
    using SafeMath for uint256;

    enum Side {
        BUY,
        SELL
    }

    event OrderFilled(uint256 filledAmount, uint256 totalCost);
    event PartialFill(uint256 filledAmount, uint256 cost);

    struct Order {
        uint256 id;
        address trader;
        Side side;
        bytes32 ticker;
        uint256 amount;
        uint256 price;
    }

    uint256 public nextOrderID;

    mapping(bytes32 => mapping(uint256 => Order[])) orderBook;

    function getOrderBook(bytes32 ticker, Side side)
        public
        view
        returns (Order[] memory)
    {
        return orderBook[ticker][uint256(side)];
    }

    function _createLimitOrder(
        Side side,
        bytes32 ticker,
        uint256 amount,
        uint256 price
    ) internal returns (uint256) {
        Order[] storage orders = orderBook[ticker][uint256(side)];
        uint256 orderID = nextOrderID;
        Order memory newOrder = Order(
            orderID,
            msg.sender,
            side,
            ticker,
            amount,
            price
        );
        nextOrderID++;
        bool hasOrderBeenInserted = false;

        // First order needs to have the highest price
        // We will insert the order at the proper place
        for (uint256 i = 0; i < orders.length; i++) {
            if (price > orders[i].price) {
                orders.push(orders[orders.length - 1]);
                for (uint256 j = orders.length - 2; j > i; j--) {
                    orders[j] = orders[j - 1];
                }
                orders[i] = newOrder;
                hasOrderBeenInserted = true;
                break;
            }
        }

        if (!hasOrderBeenInserted) {
            orders.push(newOrder);
        }
        return orderID;
    }

    function createLimitOrder(
        Side side,
        bytes32 ticker,
        uint256 amount,
        uint256 price
    ) external tokenExists(ticker) returns (uint256) {
        if (side == Side.BUY) {
            require(
                balances[msg.sender]["ETH"] >= amount.mul(price),
                "Balance not sufficient"
            );
            return _createLimitOrder(side, ticker, amount, price);
        } else {
            require(
                balances[msg.sender][ticker] >= amount,
                "Balance not sufficient"
            );
            return _createLimitOrder(side, ticker, amount, price);
        }
    }

    function _createMarketOrderBuy(bytes32 ticker, uint256 _amount)
        internal
        returns (uint256, uint256)
    {
        Order[] storage orders = orderBook[ticker][uint256(Side.SELL)];
        uint256 totalETHSpent = 0;
        uint256 amount = _amount;

        for (uint256 _i = orders.length; _i > 0; _i--) {
            uint256 j = _i - 1;
            uint256 orderAmount = orders[j].amount;
            uint256 price = orders[j].price;
            uint256 usedAmount;

            if (orderAmount > amount) {
                usedAmount = amount;
            } else {
                usedAmount = orderAmount;
            }

            uint256 totalPrice = usedAmount.mul(price);
            totalETHSpent = totalETHSpent.add(totalPrice);

            // Check that the user still has the necesarry amount for this partial fill
            require(
                balances[msg.sender]["ETH"] >= totalPrice,
                "Balance not sufficient"
            );

            // Effect: update the ETH amount
            balances[msg.sender]["ETH"] = balances[msg.sender]["ETH"].sub(
                totalPrice
            );

            // Effect: update the orderbook
            if (orderAmount > amount) {
                orders[j].amount = orders[j].amount.sub(amount);
                amount = 0;
                break;
            } else {
                amount = amount.sub(orderAmount);
                orders.pop();
            }
        }
        emit OrderFilled(_amount - amount, totalETHSpent);
        return (totalETHSpent, _amount - amount);
    }

    function _createMarketOrderSell(bytes32 ticker, uint256 _amount)
        internal
        returns (uint256, uint256)
    {
        require(
            balances[msg.sender][ticker] >= _amount,
            "Balance not sufficient"
        );
        Order[] storage orders = orderBook[ticker][uint256(Side.SELL)];
        uint256 i;
        uint256 totalETHSpent = 0;
        uint256 amount = _amount;

        return (totalETHSpent, _amount - amount);
    }

    function createMarketOrder(
        Side side,
        bytes32 ticker,
        uint256 amount
    ) external tokenExists(ticker) returns (uint256, uint256) {
        if (side == Side.BUY) {
            return _createMarketOrderBuy(ticker, amount);
        } else {
            return _createMarketOrderSell(ticker, amount);
        }
    }
}
