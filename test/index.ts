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
    usdc: Token,
    daiOracle: PriceAggregator,
    usdcOracle: PriceAggregator,
    wethOracle: PriceAggregator,
    bentobox: BentoBoxV1,
    tridentRouter: TridentRouter,
    lpDaiWeth: ConstantProductPool,
    lpUsdcWeth: ConstantProductPool,
    dcaFactory: DCAFactory,
    daiWethVault: DCA,
    usdcWethVault: DCA;

  before(async function () {
    [owner] = await ethers.getSigners();

    //deploy tokens
    const Token = await ethers.getContractFactory("Token");
    dai = await Token.deploy("DAI stable", "DAI", 18, BigNumber.from(100_000).mul((1e18).toString()));
    await dai.deployed();
    usdc = await Token.deploy("USD Coin", "USDC", 6, BigNumber.from(100_000).mul((1e6).toString()));
    await dai.deployed();
    weth = await Token.deploy("Wrapped ETH", "WETH", 18, BigNumber.from(100).mul((1e18).toString()));
    await weth.deployed();

    //deploy price aggregators
    const PriceAggregator = await ethers.getContractFactory("PriceAggregator");
    daiOracle = await PriceAggregator.deploy(8);
    usdcOracle = await PriceAggregator.deploy(8);
    wethOracle = await PriceAggregator.deploy(8);
    await daiOracle.deployed();
    await usdcOracle.deployed();
    await wethOracle.deployed();
    await daiOracle.setLatestAnswer(BigNumber.from((1e8).toString())); //1$ per DAI
    await usdcOracle.setLatestAnswer(BigNumber.from((1e8).toString())); //1$ per USDC
    await wethOracle.setLatestAnswer(BigNumber.from(3000).mul((1e8).toString())); //3000$ per WETH

    //deploy bentobox
    const Bentobox = await ethers.getContractFactory("BentoBoxV1");
    bentobox = await Bentobox.deploy(weth.address);
    await bentobox.deployed();
    await dai.approve(bentobox.address, BigNumber.from(100_000).mul((1e18).toString()));
    await usdc.approve(bentobox.address, BigNumber.from(100_000).mul((1e18).toString()));
    await weth.approve(bentobox.address, BigNumber.from(100).mul((1e18).toString()));

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

    //deploy dai-weth pool
    await masterDeployer.deployPool(
      constantProductPoolFactory.address,
      new AbiCoder().encode(["address", "address", "uint256", "bool"], [dai.address, weth.address, "30", false])
    );

    //deploy usdc-weth pool
    await masterDeployer.deployPool(
      constantProductPoolFactory.address,
      new AbiCoder().encode(["address", "address", "uint256", "bool"], [usdc.address, weth.address, "30", false])
    );

    //deposit tokens into bento
    await bentobox.deposit(dai.address, owner.address, owner.address, BigNumber.from(50_000).mul((1e18).toString()), 0);
    await bentobox.deposit(usdc.address, owner.address, owner.address, BigNumber.from(50_000).mul((1e6).toString()), 0);
    await bentobox.deposit(weth.address, owner.address, owner.address, BigNumber.from(20).mul((1e18).toString()), 0);

    //find pool addresses
    const logs = await masterDeployer.queryFilter(masterDeployer.filters.DeployPool());
    lpDaiWeth = await ethers.getContractAt("ConstantProductPool", logs[0].args.pool);
    lpUsdcWeth = await ethers.getContractAt("ConstantProductPool", logs[1].args.pool);

    //add liquidity in both pools
    await tridentRouter.addLiquidity(
      [
        { token: dai.address, native: false, amount: BigNumber.from(30_000).mul((1e18).toString()) },
        { token: weth.address, native: false, amount: BigNumber.from(10).mul((1e18).toString()) },
      ],
      lpDaiWeth.address,
      0,
      new AbiCoder().encode(["address"], [owner.address])
    );
    await tridentRouter.addLiquidity(
      [
        { token: usdc.address, native: false, amount: BigNumber.from(30_000).mul((1e6).toString()) },
        { token: weth.address, native: false, amount: BigNumber.from(10).mul((1e18).toString()) },
      ],
      lpUsdcWeth.address,
      0,
      new AbiCoder().encode(["address"], [owner.address])
    );

    //deploy dca implementation and factory
    const DCA = await ethers.getContractFactory("DCA");
    const dca = await DCA.deploy();
    await dca.deployed();

    const DCAFactory = await ethers.getContractFactory("DCAFactory");
    dcaFactory = await DCAFactory.deploy(dca.address, bentobox.address);
    await dcaFactory.deployed();

    //create dai=>weth and usdc=>weth vaults
    await dcaFactory.createDCA(
      owner.address,
      dai.address,
      weth.address,
      daiOracle.address,
      wethOracle.address,
      3600 * 24 * 7, //Once a week
      0, //both 18 decimals
      BigNumber.from(100).mul((1e18).toString()) //100 DAI
    );
    await dcaFactory.createDCA(
      owner.address,
      usdc.address,
      weth.address,
      usdcOracle.address,
      wethOracle.address,
      3600 * 24 * 7, //Once a week
      12, //6 vs 18 decimals
      BigNumber.from(100).mul((1e6).toString()) //100 USDC
    );

    const factoryLogs = await dcaFactory.queryFilter(dcaFactory.filters.CreateDCA());
    daiWethVault = await ethers.getContractAt("DCA", factoryLogs[0].args.newVault);
    usdcWethVault = await ethers.getContractAt("DCA", factoryLogs[1].args.newVault);

    //transfer tokens to the newly created vaults
    await bentobox.transfer(
      dai.address,
      owner.address,
      daiWethVault.address,
      BigNumber.from(1_000).mul((1e18).toString())
    );
    await bentobox.transfer(
      usdc.address,
      owner.address,
      usdcWethVault.address,
      BigNumber.from(1_000).mul((1e6).toString())
    );
  });

  it("Should execute dai=>weth DCA (no decimals diff)", async function () {
    const [, bot] = await ethers.getSigners();
    const userBalanceBefore = await bentobox.balanceOf(weth.address, owner.address);
    const minAmount = BigNumber.from(100)
      .mul((1e18).toString())
      .div((await wethOracle.latestAnswer()).div(BigNumber.from((1e8).toString())))
      .mul(99)
      .div(100);
    await daiWethVault.connect(bot).executeDCA([
      {
        pool: lpDaiWeth.address,
        data: new AbiCoder().encode(["address", "address", "bool"], [dai.address, daiWethVault.address, false]),
      },
    ]);
    const userBalanceAfter = await bentobox.balanceOf(weth.address, owner.address);

    expect(userBalanceBefore.add(minAmount)._hex).to.equal(userBalanceAfter._hex);
  });

  it("Should execute usdc=>weth DCA (decimals diff)", async function () {
    const [, bot] = await ethers.getSigners();
    const userBalanceBefore = await bentobox.balanceOf(weth.address, owner.address);
    const minAmount = BigNumber.from(100)
      .mul((1e6).toString())
      .mul((1e12).toString())
      .div((await wethOracle.latestAnswer()).div(BigNumber.from((1e8).toString())))
      .mul(99)
      .div(100);
    await usdcWethVault.connect(bot).executeDCA([
      {
        pool: lpUsdcWeth.address,
        data: new AbiCoder().encode(["address", "address", "bool"], [usdc.address, usdcWethVault.address, false]),
      },
    ]);
    const userBalanceAfter = await bentobox.balanceOf(weth.address, owner.address);

    expect(userBalanceBefore.add(minAmount)._hex).to.equal(userBalanceAfter._hex);
  });

  it("Should revert on executing dai=>weth DCA because ToClose()", async function () {
    const [, bot] = await ethers.getSigners();
    expect(
      daiWethVault.connect(bot).executeDCA([
        {
          pool: lpDaiWeth.address,
          data: new AbiCoder().encode(["address", "address", "bool"], [dai.address, daiWethVault.address, false]),
        },
      ])
    ).to.be.reverted;
  });

  it("Should revert on executing dai=>weth DCA because amountOut to small", async function () {
    const [, bot] = await ethers.getSigners();
    //add 1 week so no ToClose() revert
    await ethers.provider.send("evm_increaseTime", [3600 * 24 * 7]);
    expect(
      daiWethVault.connect(bot).executeDCA([
        {
          pool: lpDaiWeth.address,
          data: new AbiCoder().encode(["address", "address", "bool"], [dai.address, daiWethVault.address, false]),
        },
      ])
    ).to.be.reverted;
  });

  it("Should withdraw remaining funds", async function () {
    const userBalanceBefore = await bentobox.balanceOf(dai.address, owner.address);
    const vaultBalanceBefore = await bentobox.balanceOf(dai.address, daiWethVault.address);

    await daiWethVault.withdraw(vaultBalanceBefore);

    const userBalanceAfter = await bentobox.balanceOf(dai.address, owner.address);
    const vaultBalanceAfter = await bentobox.balanceOf(dai.address, daiWethVault.address);
    expect(userBalanceBefore.add(vaultBalanceBefore)._hex).to.equal(userBalanceAfter._hex);
    expect(vaultBalanceAfter._hex).to.equal(BigNumber.from(0)._hex);
  });

  it("Should revert on withdraw because OwnerOnly()", async function () {
    const [, bot] = await ethers.getSigners();
    expect(daiWethVault.connect(bot).withdraw(BigNumber.from(10))).to.be.reverted;
  });
});
