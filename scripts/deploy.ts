// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const bentoboxAddress = "0x0319000133d3ada02600f0875d2cf03d442c3367";

  //deploy dca implementation and factory
  const DCA = await ethers.getContractFactory("DCA");
  const dca = await DCA.deploy();
  await dca.deployed();

  const DCAFactory = await ethers.getContractFactory("DCAFactory");
  const dcaFactory = await DCAFactory.deploy(dca.address, bentoboxAddress);
  await dcaFactory.deployed();

  console.log("dcaFactory =>" + dcaFactory.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
