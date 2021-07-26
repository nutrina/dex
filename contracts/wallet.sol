// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Wallet is Ownable {
    using SafeMath for uint256;

    struct Token {
        bytes32 ticker;
        address tokenAddress;
    }

    mapping(bytes32 => Token) public tokenMapping;
    bytes32[] public tokenList;
    mapping(address => mapping(bytes32 => uint256)) public balances;

    modifier tokenExists(bytes32 ticker) {
        require(
            tokenMapping[ticker].tokenAddress != address(0),
            "Ticker does not yet exists"
        );
        _;
    }

    function addToken(bytes32 ticker, address tokenAddress) external onlyOwner {
        tokenMapping[ticker] = Token(ticker, tokenAddress);
        tokenList.push(ticker);
    }

    function deposit(uint256 amount, bytes32 ticker)
        external
        tokenExists(ticker)
    {
        IERC20 erc20 = IERC20(tokenMapping[ticker].tokenAddress);

        balances[msg.sender][ticker] = balances[msg.sender][ticker].add(amount);
        erc20.transferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount, bytes32 ticker)
        external
        tokenExists(ticker)
    {
        require(
            balances[msg.sender][ticker] >= amount,
            "Balance not sufficient"
        );

        balances[msg.sender][ticker] = balances[msg.sender][ticker].sub(amount);
        IERC20(tokenMapping[ticker].tokenAddress).transfer(msg.sender, amount);
    }

    function depositETH() external payable {
        balances[msg.sender]["ETH"] = balances[msg.sender]["ETH"].add(
            msg.value
        );
    }

    function withdrawETH(uint256 amount) external returns(bool success) {
        require(
            balances[msg.sender]["ETH"] >= amount,
            "Balance not sufficient"
        );

        balances[msg.sender]["ETH"] = balances[msg.sender]["ETH"].sub(amount);
        (success, ) = msg.sender.call{value: amount}("");
    }
}
