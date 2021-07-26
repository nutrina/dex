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
                "ETH Balance not sufficient"
            );
            return _createLimitOrder(side, ticker, amount, price);
        } else {
            require(
                balances[msg.sender][ticker] >= amount,
                "Token Balance not sufficient"
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
            Order storage order = orders[_i - 1];
            uint256 usedAmount;

            if (order.amount > amount) {
                usedAmount = amount;
            } else {
                usedAmount = order.amount;
            }

            uint256 totalPrice = usedAmount.mul(order.price);
            totalETHSpent = totalETHSpent.add(totalPrice);

            // Check that the user still has the necesarry amount for this partial fill
            require(
                balances[msg.sender]["ETH"] >= totalPrice,
                "ETH balance not sufficient"
            );
            require(
                balances[order.trader][ticker] >= usedAmount,
                "Token balance not sufficient"
            );

            // Effect: update the ETH amount of buyer and seller
            balances[msg.sender]["ETH"] = balances[msg.sender]["ETH"].sub(
                totalPrice
            );
            balances[order.trader]["ETH"] = balances[order.trader]["ETH"].add(
                totalPrice
            );

            // Effect: update the token amount of buyer and seller
            balances[msg.sender][ticker] = balances[msg.sender][ticker].add(
                usedAmount
            );
            balances[order.trader][ticker] = balances[order.trader][ticker].sub(
                usedAmount
            );

            // Effect: update the orderbook
            if (order.amount > amount) {
                order.amount = order.amount.sub(amount);
                amount = 0;
                break;
            } else {
                amount = amount.sub(order.amount);
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
        Order[] storage orders = orderBook[ticker][uint256(Side.BUY)];
        uint256 totalETHSpent = 0;
        uint256 amount = _amount;

        for (uint256 _i = orders.length; _i > 0; _i--) {
            Order storage order = orders[_i - 1];
            uint256 usedAmount;

            if (order.amount > amount) {
                usedAmount = amount;
            } else {
                usedAmount = order.amount;
            }

            uint256 totalPrice = usedAmount.mul(order.price);
            totalETHSpent = totalETHSpent.add(totalPrice);

            // Check that the user still has the necesarry amount for this partial fill
            require(
                balances[order.trader]["ETH"] >= totalPrice,
                "ETH balance not sufficient"
            );
            require(
                balances[msg.sender][ticker] >= usedAmount,
                "Token balance not sufficient"
            );

            // Effect: update the ETH amount of buyer and seller
            balances[order.trader]["ETH"] = balances[order.trader]["ETH"].sub(
                totalPrice
            );
            balances[msg.sender]["ETH"] = balances[msg.sender]["ETH"].add(
                totalPrice
            );

            // Effect: update the token amount of buyer and seller
            balances[order.trader][ticker] = balances[order.trader][ticker].add(
                usedAmount
            );
            balances[msg.sender][ticker] = balances[msg.sender][ticker].sub(
                usedAmount
            );

            // Effect: update the orderbook
            if (order.amount > amount) {
                order.amount = order.amount.sub(amount);
                amount = 0;
                break;
            } else {
                amount = amount.sub(order.amount);
                orders.pop();
            }
        }
        emit OrderFilled(_amount - amount, totalETHSpent);
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
