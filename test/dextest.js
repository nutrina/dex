
const Dex = artifacts.require("Dex");
const Link = artifacts.require("Link");
const truffleAssert = require("truffle-assertions");
const toBN = web3.utils.toBN;

const BUY = 0;
const SELL = 1;


contract("Dex", accounts => {
    let linksymbol = web3.utils.fromUtf8("LINK");
    let initialEth = 100000;
    let initialLink = 10;

    before(async () => {
        try {
            console.log("BEFORE ONCE !!!");
            let dex = await Dex.deployed();
            let link = await Link.deployed();

            await link.approve(dex.address, initialLink * 100);
            await dex.addToken(linksymbol, link.address, { from: accounts[0] });
            await dex.deposit(initialLink, linksymbol);
            await dex.depositETH({value: initialEth});
        } catch(error) {
            console.log("ERROR ", error);
        }
    });

    after(async () => {
    });

    it("user must have deposited ETH, greater than the value in the buy order amount", async () => {
        let dex = await Dex.deployed();

        await truffleAssert.reverts(
            dex.createLimitOrder(BUY, linksymbol, 1, initialEth / 1 * 2)
        );

        await truffleAssert.passes(
            dex.createLimitOrder(BUY, linksymbol, 1, initialEth / 1 / 2)
        );

        await truffleAssert.passes(
            dex.createLimitOrder(BUY, linksymbol, 1, initialEth)
        );
    });

    it("user must have deposited a LINK amount, greater than the value in the sell order amount", async () => {
        let dex = await Dex.deployed();
        let link = await Link.deployed();

        let balance = await dex.balances(accounts[0], linksymbol);
        assert.equal(balance.toString(), initialLink);

        await truffleAssert.reverts(
            dex.createLimitOrder(SELL, linksymbol, initialLink * 2, initialEth), "Balance not sufficient", "This should fail due to insufficient balance"
        );

        await truffleAssert.passes(
            dex.createLimitOrder(SELL, linksymbol, initialLink / 2, 1), "This should pass"
        );
    });

    it("the first order in the buy order book needs to have the highest price", async () => {
        let dex = await Dex.deployed();
        let ordersPrices = [20, 10, 100, 5, 45];
        for (let i = 0; i < ordersPrices.length; i++) {
            await dex.createLimitOrder(BUY, linksymbol, 1, ordersPrices[i])
        }

        let orderBook = await dex.getOrderBook(linksymbol, BUY);
        assert(orderBook.length > 0, "Orderbook is empty");
        
        for (let i = 0; i < orderBook.length - 1; i++) {
            let prev = orderBook[i].price;
            let next = orderBook[i + 1].price;
            prev = toBN(prev);
            next = toBN(next);
            
            assert(prev.cmp(next) >= 0, "prev should be larger or equal to next");
        }
    });

    it("the first order in the sell order book needs to have the highest price", async () => {
        let dex = await Dex.deployed();
        let ordersPrices = [20, 10, 100, 5, 45];
        for (let i = 0; i < ordersPrices.length; i++) {
            dex.createLimitOrder(SELL, linksymbol, 1, ordersPrices[i])
        }

        let orderBook = await dex.getOrderBook(linksymbol, SELL);
        assert(orderBook.length > 0, "Orderbook is empty");

        for (let i = 0; i < orderBook.length - 1; i++) {
            let prev = orderBook[i].price;
            let next = orderBook[i + 1].price;
            prev = toBN(prev);
            next = toBN(next);
            
            assert(prev.cmp(next) >= 0, "prev should be larger or equal to next");
        }
    });
})


