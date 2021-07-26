
const Dex = artifacts.require("Dex");
const Link = artifacts.require("Link");
const truffleAssert = require("truffle-assertions");

contract.skip("Wallet", accounts => {
    before(async() => {
        console.log("BEFORE ONCE !!!");
    });

    after(async() => {
        console.log("AFTER ONCE !!!");
    });

    beforeEach(async() => {
        console.log("BEFORE EACH !!!");
    });

    afterEach(async() => {
        console.log("AFTER EACH !!!");
    });

    it("should only be possible for owner to add tokens", async () => {
        let dex = await Dex.deployed();
        let link = await Link.deployed();

        await truffleAssert.passes(
            dex.addToken(web3.utils.fromUtf8("LINK"), link.address, {from: accounts[0]})
        );

        await truffleAssert.reverts(
            dex.addToken(web3.utils.fromUtf8("LINK"), link.address, {from: accounts[1]})
        );
    });

    it("it should handle deposits correctly", async () => {
        let dex = await Dex.deployed();
        let link = await Link.deployed();

        await link.approve(dex.address, 500);
        await dex.deposit(100, web3.utils.fromUtf8("LINK"));
        let balance = await dex.balances(accounts[0], web3.utils.fromUtf8("LINK"));
        assert.equal(balance.toNumber(), 100);
    });


    it("it should handle faulty withdrawals correctly", async () => {
        let dex = await Dex.deployed();

        await truffleAssert.reverts(
            dex.withdraw(500, web3.utils.fromUtf8("LINK"), {from: accounts[0]})
        );
    });

    it("it should handle withdrawals correctly", async () => {
        let dex = await Dex.deployed();
        let link = await Link.deployed();
        await link.approve(dex.address, 500);
        await dex.deposit(100, web3.utils.fromUtf8("LINK"), {from: accounts[0]});
        let balance = await dex.balances(accounts[0], web3.utils.fromUtf8("LINK"));
        assert.equal(balance.toNumber(), 200);

        await truffleAssert.passes(
            dex.withdraw(100, web3.utils.fromUtf8("LINK"), {from: accounts[0]})
        );
    });
})


