
const Dex = artifacts.require("Dex");
const Link = artifacts.require("Link");
const truffleAssert = require("truffle-assertions");
const toBN = web3.utils.toBN;

const BUY = 0;
const SELL = 1;


contract("Dex - Market Order", accounts => {
    let linksymbol = web3.utils.fromUtf8("LINK");
    let ethsymbol = web3.utils.fromUtf8("ETH");
    let owner = accounts[0];
    let seller1 = accounts[1];
    let seller2 = accounts[2];
    let seller3 = accounts[3];
    let buyer = accounts[4];

    before(async () => {
        // Nothing to do here for now ...
    });

    beforeEach("Ensure balances of buyers and sellers", async () => {
        try {
            let dex = await Dex.deployed();
            let link = await Link.deployed();

            await dex.addToken(linksymbol, link.address, { from: owner });

            // Distribute tokens, each account should have 100
            let balance;

            for (s of [seller1, seller2, seller3]) {
                balance = (await link.balanceOf(s)).toNumber();
                await link.transfer(s, Math.max(0, 100 - balance), { from: owner });
                await link.approve(dex.address, 100, { from: s });
            }
        } catch (error) {
            console.log("ERROR ", error);
        }
    });

    afterEach(async () => {
        let dex = await Dex.deployed();
        let link = await Link.deployed();

        // Cleanup account balances and orders
        try {
            let orderBook
            // Clear all SELL orders
            orderBook = await dex.getOrderBook(linksymbol, SELL);
            for (let i = 0; i < orderBook.length; i++) {
                let o = orderBook[i];
                await dex.depositETH({ value: o.amount, from: buyer });
                await dex.createMarketOrder(BUY, linksymbol, o.amount, { from: buyer });
            }

            // Clear all BUY orders
            orderBook = await dex.getOrderBook(linksymbol, BUY);
            for (let i = 0; i < orderBook.length; i++) {
                let o = orderBook[i];
                await link.approve(dex.address, o.amount, { from: owner });
                await dex.deposit(o.amount, linksymbol, { from: owner });
                await dex.createMarketOrder(SELL, linksymbol, o.amount, { from: owner });
            }


            for (let i = 0; i < accounts.length; i++) {
                let acc = accounts[i];

                // Withdraw tokens
                let balance = await dex.balances(acc, linksymbol);
                balance = balance.toNumber();
                if (balance > 0) {
                    await dex.withdraw(balance, linksymbol, { from: acc });
                }

                // Withdraw ETH
                balance = await dex.balances(acc, ethsymbol);
                balance = balance.toNumber();
                if (balance > 0) {
                    await dex.withdrawETH(balance, { from: acc });
                }
            }

        } catch (error) {
            console.log("ERROR ", error);
        }
    });

    it("When creating a SELL market order, the seller needs to have enough tokens for the trade", async () => {
        let dex = await Dex.deployed();
        let link = await Link.deployed();

        // Create limit order first
        await dex.depositETH({ value: 10, from: buyer });
        await dex.createLimitOrder(BUY, linksymbol, 10, 1, { from: buyer });

        // Now create the market orders
        await truffleAssert.reverts(
            dex.createMarketOrder(SELL, linksymbol, 10, { from: seller1 }), "Balance not sufficient", "This should fail due to insufficient balance"
        );

        // Deposit token and try again
        await dex.deposit(10, linksymbol, { from: seller1 });
        await truffleAssert.passes(
            dex.createMarketOrder(SELL, linksymbol, 10, { from: seller1 }), "This should pass"
        );
    });

    it("When creating a BUY market order, the buyer needs to have enough ETH for the trade", async () => {
        let dex = await Dex.deployed();

        // Create limit order first
        await dex.deposit(10, linksymbol, { from: seller1 });
        await dex.createLimitOrder(SELL, linksymbol, 10, 1, { from: seller1 })

        // Test market order
        await truffleAssert.reverts(
            dex.createMarketOrder(BUY, linksymbol, 2, { from: buyer })
        );

        // Test again after funding with ETH
        await dex.depositETH({ value: 10, from: buyer });
        await truffleAssert.passes(
            dex.createMarketOrder(BUY, linksymbol, 10, { from: buyer })
        );
    });

    it("Market orders can be submitted even if the order book is empty", async () => {
        let dex = await Dex.deployed();

        let orderBook = await dex.getOrderBook(linksymbol, SELL);
        assert(orderBook.length == 0, "Orderbook should be empty at beginning of test");

        await truffleAssert.passes(
            dex.createMarketOrder(BUY, linksymbol, 1, { from: buyer })
        );
    });

    it("Market orders should be filled until the order book is empty", async () => {
        let dex = await Dex.deployed();

        let orderBook = await dex.getOrderBook(linksymbol, SELL);
        assert(orderBook.length == 0, "Orderbook should be empty at beginning of test");

        // Create some limit orders
        await dex.deposit(15, linksymbol, { from: seller1 });
        await dex.deposit(20, linksymbol, { from: seller2 });
        await dex.deposit(25, linksymbol, { from: seller3 });

        await dex.createLimitOrder(SELL, linksymbol, 15, 1, { from: seller1 })
        await dex.createLimitOrder(SELL, linksymbol, 20, 1, { from: seller2 })
        await dex.createLimitOrder(SELL, linksymbol, 25, 1, { from: seller3 })

        // Create market order
        await dex.depositETH({ value: 60, from: buyer });
        let result = await dex.createMarketOrder(BUY, linksymbol, 120, { from: buyer })

        truffleAssert.eventEmitted(result, 'OrderFilled', (ev) => {
            return ev.filledAmount.toString() === "60";
        });

        // Order book should be empty
        orderBook = await dex.getOrderBook(linksymbol, SELL);
        assert(orderBook.length == 0, "Orderbook should be empty");
    });

    it("Market orders should be filled until order is 100% filled", async () => {
        let dex = await Dex.deployed();

        let orderBook = await dex.getOrderBook(linksymbol, SELL);
        assert(orderBook.length == 0, "Orderbook should be empty at beginning of test");

        // Create some limit orders
        await dex.deposit(25, linksymbol, { from: seller1 });
        await dex.deposit(30, linksymbol, { from: seller2 });
        await dex.deposit(35, linksymbol, { from: seller3 });

        await dex.createLimitOrder(SELL, linksymbol, 25, 1, { from: seller1 })
        await dex.createLimitOrder(SELL, linksymbol, 30, 1, { from: seller2 })
        await dex.createLimitOrder(SELL, linksymbol, 35, 1, { from: seller3 })

        // Create market order
        await dex.depositETH({ value: 70, from: buyer });
        let result = await dex.createMarketOrder(BUY, linksymbol, 70, { from: buyer })

        truffleAssert.eventEmitted(result, 'OrderFilled', (ev) => {
            return ev.filledAmount.toString() === "70";
        });

        orderBook = await dex.getOrderBook(linksymbol, SELL);
        assert.equal(orderBook.length, 1, "Orderbook should contain only 1 open limit order");
        assert.equal(orderBook[0].amount, "20");
    });

    it("The eth balance of the buyer should decrease with the filled amount, while the sellers should increase. Similar to link balances but oposite direction.", async () => {
        let dex = await Dex.deployed();
        let orderBook = await dex.getOrderBook(linksymbol, SELL);
        assert(orderBook.length == 0, "Orderbook should be empty at beginning of test");

        // Create some limit orders
        await dex.deposit(25, linksymbol, { from: seller1 });
        await dex.deposit(30, linksymbol, { from: seller2 });
        await dex.deposit(35, linksymbol, { from: seller3 });

        await dex.createLimitOrder(SELL, linksymbol, 25, 1, { from: seller1 })
        await dex.createLimitOrder(SELL, linksymbol, 30, 1, { from: seller2 })
        await dex.createLimitOrder(SELL, linksymbol, 35, 1, { from: seller3 })

        // Create market order
        await dex.depositETH({ value: 70, from: buyer });
        let result = await dex.createMarketOrder(BUY, linksymbol, 45, { from: buyer })

        truffleAssert.eventEmitted(result, 'OrderFilled', (ev) => {
            return ev.filledAmount.toString() === "45";
        });

        let buyerEthBalance = await dex.balances(buyer, ethsymbol);
        let seller1EthBalance = await dex.balances(seller1, ethsymbol);
        let seller2EthBalance = await dex.balances(seller2, ethsymbol);
        let seller3EthBalance = await dex.balances(seller3, ethsymbol);

        let buyerLinkBalance = await dex.balances(buyer, linksymbol);
        let seller1LinkBalance = await dex.balances(seller1, linksymbol);
        let seller2LinkBalance = await dex.balances(seller2, linksymbol);
        let seller3LinkBalance = await dex.balances(seller3, linksymbol);

        assert.equal(buyerEthBalance.toString(), "25", "Buyers ETH amount has not been decreased to expected amount");
        assert.equal(seller1EthBalance.toString(), "0", "Seller1 ETH amount has not been increased to expected amount");
        assert.equal(seller2EthBalance.toString(), "10", "Seller2 ETH amount has not been increased to expected amount");
        assert.equal(seller3EthBalance.toString(), "35", "Seller3 ETH amount has not been increased to expected amount");

        assert.equal(buyerLinkBalance.toString(), "45", "Buyers Link amount has not been increased to expected amount");
        assert.equal(seller1LinkBalance.toString(), "25", "Seller1 Link amount has not been decreased to expected amount");
        assert.equal(seller2LinkBalance.toString(), "20", "Seller2 Link amount has not been decreased to expected amount");
        assert.equal(seller3LinkBalance.toString(), "0", "Seller3 Link amount has not been decreased to expected amount");
    });

    it("Filled limit order should be removed from the orderbook", async () => {
        let dex = await Dex.deployed();

        let orderBook = await dex.getOrderBook(linksymbol, SELL);
        assert(orderBook.length == 0, "Orderbook should be empty at beginning of test");

        // Create some limit orders
        await dex.deposit(30, linksymbol, { from: seller1 });
        await dex.deposit(30, linksymbol, { from: seller2 });
        await dex.deposit(30, linksymbol, { from: seller3 });

        await dex.createLimitOrder(SELL, linksymbol, 10, 1, { from: seller1 });
        await dex.createLimitOrder(SELL, linksymbol, 10, 1, { from: seller1 });
        await dex.createLimitOrder(SELL, linksymbol, 10, 1, { from: seller1 });

        await dex.createLimitOrder(SELL, linksymbol, 10, 1, { from: seller2 });
        await dex.createLimitOrder(SELL, linksymbol, 10, 1, { from: seller2 });
        await dex.createLimitOrder(SELL, linksymbol, 10, 1, { from: seller2 });

        await dex.createLimitOrder(SELL, linksymbol, 10, 1, { from: seller3 });
        await dex.createLimitOrder(SELL, linksymbol, 10, 1, { from: seller3 });
        await dex.createLimitOrder(SELL, linksymbol, 10, 1, { from: seller3 });

        assert.equal((await dex.getOrderBook(linksymbol, SELL)).length, 9, "Invalid orderbook length");

        // Create market order
        await dex.depositETH({ value: 90, from: buyer });

        // Create orders and verify orderbook length
        await dex.createMarketOrder(BUY, linksymbol, 25, { from: buyer });
        assert.equal((await dex.getOrderBook(linksymbol, SELL)).length, 7, "Invalid orderbook length");

        await dex.createMarketOrder(BUY, linksymbol, 5, { from: buyer });
        assert.equal((await dex.getOrderBook(linksymbol, SELL)).length, 6, "Invalid orderbook length");

        await dex.createMarketOrder(BUY, linksymbol, 10, { from: buyer });
        assert.equal((await dex.getOrderBook(linksymbol, SELL)).length, 5, "Invalid orderbook length");

        await dex.createMarketOrder(BUY, linksymbol, 20, { from: buyer });
        assert.equal((await dex.getOrderBook(linksymbol, SELL)).length, 3, "Invalid orderbook length");

        await dex.createMarketOrder(BUY, linksymbol, 30, { from: buyer });
        assert.equal((await dex.getOrderBook(linksymbol, SELL)).length, 0, "Invalid orderbook length");
    });
})


