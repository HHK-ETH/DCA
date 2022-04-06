// import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { AbiCoder } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { BentoBoxV1, ConstantProductPool, DCA, DCAFactory, PriceAggregator, Token, TridentRouter } from "../typechain";

describe("DCA", function () {
  let owner: SignerWithAddress,
    dai: Token,
    weth: Token,
    sellTokenPriceAggregator: PriceAggregator,
    buyTokenPriceAggregator: PriceAggregator,
    bentobox: BentoBoxV1,
    tridentRouter: TridentRouter,
    lp: ConstantProductPool,
    dca: DCA,
    dcaFactory: DCAFactory,
    vault: DCA;

  before(async function () {
    [owner] = await ethers.getSigners();

    //deploy tokens
    const Token = await ethers.getContractFactory("Token");
    dai = await Token.deploy(
      "DAI stablecoin",
      "DAI",
      BigNumber.from(18),
      BigNumber.from(100_000).mul((1e18).toString())
    );
    await dai.deployed();
    weth = await Token.deploy("Wrapped ETH", "WETH", BigNumber.from(18), BigNumber.from(100).mul((1e18).toString()));
    await weth.deployed();

    //deploy price aggregators
    const PriceAggregator = await ethers.getContractFactory("PriceAggregator");
    sellTokenPriceAggregator = await PriceAggregator.deploy("8");
    buyTokenPriceAggregator = await PriceAggregator.deploy("8");
    await sellTokenPriceAggregator.deployed();
    await buyTokenPriceAggregator.deployed();
    await sellTokenPriceAggregator.setLatestAnswer(BigNumber.from(1).mul((1e8).toString())); //1$ per DAI
    await buyTokenPriceAggregator.setLatestAnswer(BigNumber.from(3000).mul((1e8).toString())); //3000$ per WETH

    //deploy bentobox
    const Bentobox = await ethers.getContractFactory("BentoBoxV1");
    bentobox = await Bentobox.deploy(weth.address);
    await bentobox.deployed();
    await dai.approve(bentobox.address, BigNumber.from(10).pow(18).mul(100_000));
    await weth.approve(bentobox.address, BigNumber.from(10).pow(18).mul(100));

    //deploy trident
    const MasterDeployer = await ethers.getContractFactory("MasterDeployer");
    const masterDeployer = await MasterDeployer.deploy("2000", owner.address, bentobox.address);
    await masterDeployer.deployed();

    const ConstantProductPoolFactory = await ethers.getContractFactory("ConstantProductPoolFactory");
    const constantProductPoolFactory = await ConstantProductPoolFactory.deploy(masterDeployer.address);
    await constantProductPoolFactory.deployed();
    await masterDeployer.addToWhitelist(constantProductPoolFactory.address);

    const TridentRouter = await ethers.getContractFactory("TridentRouter");
    tridentRouter = await TridentRouter.deploy(bentobox.address, masterDeployer.address, weth.address);
    await tridentRouter.deployed();
    //whitelist trident
    await bentobox.whitelistMasterContract(tridentRouter.address, true);
    await bentobox.setMasterContractApproval(
      owner.address,
      tridentRouter.address,
      true,
      "0",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );

    //deploy dai-weth pool and add liquidity
    await masterDeployer.deployPool(
      constantProductPoolFactory.address,
      new AbiCoder().encode(["address", "address", "uint256", "bool"], [dai.address, weth.address, "30", false])
    );

    const logs = await masterDeployer.queryFilter(masterDeployer.filters.DeployPool());
    lp = await ethers.getContractAt("ConstantProductPool", logs[0].args.pool);
    await bentobox.deposit(dai.address, owner.address, owner.address, BigNumber.from(10).pow(18).mul(50_000), 0);
    await bentobox.deposit(weth.address, owner.address, owner.address, BigNumber.from(10).pow(18).mul(10), 0);
    await tridentRouter.addLiquidity(
      [
        { token: dai.address, native: false, amount: BigNumber.from(10).pow(18).mul(30_000) },
        { token: weth.address, native: false, amount: BigNumber.from(10).pow(18).mul(10) },
      ],
      lp.address,
      0,
      new AbiCoder().encode(["address"], [owner.address])
    );

    //deploy dca implementation and factory
    const DCA = await ethers.getContractFactory("DCA");
    dca = await DCA.deploy();
    await dca.deployed();

    const DCAFactory = await ethers.getContractFactory("DCAFactory");
    dcaFactory = await DCAFactory.deploy(dca.address, bentobox.address);
    await dcaFactory.deployed();
  });

  it("Should create a new vault", async function () {
    await dcaFactory.createDCA(
      owner.address,
      dai.address,
      weth.address,
      sellTokenPriceAggregator.address,
      buyTokenPriceAggregator.address,
      3600 * 24 * 7, //Once a week
      0,
      BigNumber.from(100).mul((1e18).toString()) //100 DAI
    );

    const logs = await dcaFactory.queryFilter(dcaFactory.filters.CreateDCA());
    vault = await ethers.getContractAt("DCA", logs[0].args.newVault);
  });

  it("Should transfer to vault", async function () {
    await bentobox.transfer(dai.address, owner.address, vault.address, BigNumber.from(10).pow(18).mul(1_000));
  });

  it("Should execute DCA", async function () {
    const [, bot] = await ethers.getSigners();
    const userBalanceBefore = await bentobox.balanceOf(weth.address, owner.address);
    const minAmount = BigNumber.from(100)
      .mul((1e18).toString())
      .div((await buyTokenPriceAggregator.latestAnswer()).div(BigNumber.from(10).pow(8)))
      .mul(99)
      .div(100);
    await vault.connect(bot).executeDCA([
      {
        pool: lp.address,
        data: new AbiCoder().encode(["address", "address", "bool"], [dai.address, vault.address, false]),
      },
    ]);
    const userBalanceAfter = await bentobox.balanceOf(weth.address, owner.address);
    console.log(userBalanceBefore.toString());
    console.log(userBalanceAfter.toString());
    console.log(minAmount.toString());

    expect(userBalanceBefore.add(minAmount)._hex).to.equal(userBalanceAfter._hex);
  });

  it("Should not execute DCA", async function () {
    const [, bot] = await ethers.getSigners();
    expect(
      vault.connect(bot).executeDCA([
        {
          pool: lp.address,
          data: new AbiCoder().encode(["address", "address", "bool"], [dai.address, vault.address, false]),
        },
      ])
    ).to.be.reverted;
  });

  it("Should withdraw remaining funds", async function () {
    const userBalanceBefore = await bentobox.balanceOf(dai.address, owner.address);
    const vaultBalanceBefore = await bentobox.balanceOf(dai.address, vault.address);

    await vault.withdraw(vaultBalanceBefore);

    const userBalanceAfter = await bentobox.balanceOf(dai.address, owner.address);
    const vaultBalanceAfter = await bentobox.balanceOf(dai.address, vault.address);
    expect(userBalanceBefore.add(vaultBalanceBefore)._hex).to.equal(userBalanceAfter._hex);
    expect(vaultBalanceAfter._hex).to.equal(BigNumber.from(0)._hex);
  });

  it("Should no withdraw remaining funds", async function () {
    const [, bot] = await ethers.getSigners();
    expect(vault.connect(bot).withdraw(BigNumber.from(10))).to.be.reverted;
  });
});
