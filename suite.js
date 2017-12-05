'use strict'

import { expectRevertOrFail } from './helpers'

export default function suite(options) {
	const accounts = options.accounts

	// configure
	const initialSupply = options.initialSupply || new web3.BigNumber(0)
	const initialBalances = options.initialBalances || []
	const initialAllowances = options.initialAllowances || []
	const createToken = options.token
	const purchase = function (to, amount) { return options.purchase(token, to, amount) }

	// setup
	const expect = require('chai')
		.use(require('chai-bignumber')(web3.BigNumber))
		.expect

	// name the accounts
	const alice = accounts[1]
	const bob = accounts[2]
	const charles = accounts[3]

	let token = null

	beforeEach(async function () {
		token = await createToken()
	})

	describe('ERC-20', function () {
		describe('totalSupply()', function () {
			it('should have initial supply of ' + initialSupply.toFormat(), async function () {
				expect(await token.totalSupply.call()).to.be.bignumber.equal(initialSupply)
			})

			it('should return the correct supply', async function () {
				await purchase(alice, 1)
				expect(await token.totalSupply.call()).to.be.bignumber.equal(initialSupply.plus(1))

				await purchase(alice, 2)
				expect(await token.totalSupply.call()).to.be.bignumber.equal(initialSupply.plus(3))

				await purchase(bob, 3)
				expect(await token.totalSupply.call()).to.be.bignumber.equal(initialSupply.plus(6))
			})
		})

		describe('balanceOf(_owner)', function () {
			it('should have correct initial balances', async function () {
				for (let i = 0; i < initialBalances.length; i++) {
					let address = initialBalances[i][0]
					let balance = initialBalances[i][1]
					expect(await token.balanceOf.call(address)).to.be.bignumber.equal(balance)
				}
			})

			it('should return the correct balances', async function () {
				await purchase(alice, 1)
				expect(await token.balanceOf.call(alice)).to.be.bignumber.equal(1)

				await purchase(alice, 2)
				expect(await token.balanceOf.call(alice)).to.be.bignumber.equal(3)

				await purchase(bob, 3)
				expect(await token.balanceOf.call(bob)).to.be.bignumber.equal(3)
			})
		})

		describe('allowance(_owner, _spender)', function () {
			it('should have correct initial allowance', async function () {
				for (let i = 0; i < initialAllowances.length; i++) {
					let owner = initialAllowances[i][0]
					let spender = initialAllowances[i][1]
					let expectedAllowance = initialAllowances[i][2]
					expect(await token.allowance.call(owner, spender)).to.be.bignumber.equal(expectedAllowance)
				}
			})

			let describeAllowance = function (name, from, to) {
				describe('when ' + name, function () {
					it('should return the correct allowance', async function () {
						await token.approve(to, 1, { from: from })
						expect(await token.allowance.call(from, to)).to.be.bignumber.equal(1)
					})
				})
			}

			describeAllowance('_owner != _spender', alice, bob)
			describeAllowance('_owner == _spender', alice, alice)

			it('should return the correct allowance', async function () {
				await token.approve(bob, 1, { from: alice })
				await token.approve(charles, 2, { from: alice })
				await token.approve(charles, 3, { from: bob })
				await token.approve(alice, 4, { from: bob })
				await token.approve(alice, 5, { from: charles })
				await token.approve(bob, 6, { from: charles })

				expect(await token.allowance.call(alice, bob)).to.be.bignumber.equal(1)
				expect(await token.allowance.call(alice, charles)).to.be.bignumber.equal(2)
				expect(await token.allowance.call(bob, charles)).to.be.bignumber.equal(3)
				expect(await token.allowance.call(bob, alice)).to.be.bignumber.equal(4)
				expect(await token.allowance.call(charles, alice)).to.be.bignumber.equal(5)
				expect(await token.allowance.call(charles, bob)).to.be.bignumber.equal(6)
			})
		})

		// NOTE: assumes that approve should always succeed
		describe('approve(_spender, _value)', function () {
			let describeApprove = function (name, from, to) {
				describe('when ' + name, function () {
					it('should return true when approving 0', async function () {
						assert.isTrue(await token.approve.call(to, 0, { from: from }))
					})

					it('should return true when approving', async function () {
						assert.isTrue(await token.approve.call(to, 3, { from: from }))
					})

					it('should return true when updating approval', async function () {
						assert.isTrue(await token.approve.call(to, 2, { from: from }))
						await token.approve(to, 2, { from: from })

						// test decreasing approval
						assert.isTrue(await token.approve.call(to, 1, { from: from }))

						// test not-updating approval
						assert.isTrue(await token.approve.call(to, 2, { from: from }))

						// test increasing approval
						assert.isTrue(await token.approve.call(to, 3, { from: from }))
					})

					it('should return true when revoking approval', async function () {
						await token.approve(to, 3, { from: from })
						assert.isTrue(await token.approve.call(to, 0, { from: from }))
					})

					it('should update allowance accordingly', async function () {
						await token.approve(to, 1, { from: from })
						expect(await token.allowance(from, to)).to.be.bignumber.equal(1)

						await token.approve(to, 3, { from: from })
						expect(await token.allowance(from, to)).to.be.bignumber.equal(3)

						await token.approve(to, 0, { from: from })
						expect(await token.allowance(from, to)).to.be.bignumber.equal(0)
					})

					it('should fire Approval event', async function () {
						await testApprovalEvent(from, to, 1)
						if (from != to) {
							await testApprovalEvent(to, from, 2)
						}
					})

					it('should fire Approval when allowance was set to 0', async function () {
						await token.approve(to, 3, { from: from })
						await testApprovalEvent(from, to, 0)
					})

					it('should fire Approval even when allowance did not change', async function () {
						// even 0 -> 0 should fire Approval event
						await testApprovalEvent(from, to, 0)

						await token.approve(to, 3, { from: from })
						await testApprovalEvent(from, to, 3)
					})
				})
			}

			describeApprove('_spender != sender', alice, bob)
			describeApprove('_spender == sender', alice, alice)

			async function testApprovalEvent(from, to, amount) {
				let result = await token.approve(to, amount, { from: from })
				let log = result.logs[0]
				assert.equal(log.event, 'Approval')
				assert.equal(log.args.owner, from)
				assert.equal(log.args.spender, to)
				expect(log.args.value).to.be.bignumber.equal(amount)
			}
		})

		describe('transfer(_to, _value)', function () {
			let describeTransfer = function (name, from, to) {
				describe('when ' + name, function () {
					it('should return true when called with amount of 0', async function () {
						assert.isTrue(await token.transfer.call(to, 0, { from: from }))
					})

					it('should revert when trying to transfer something while having nothing', async function () {
						await expectRevertOrFail(token.transfer(to, 1, { from: from }))
					})

					it('should revert when trying to transfer more than balance', async function () {
						await purchase(from, 3)
						await expectRevertOrFail(token.transfer(to, 4, { from: from }))

						await token.transfer('0x1', 1, { from: from })
						await expectRevertOrFail(token.transfer(to, 3, { from: from }))
					})

					it('should return true when transfer can be made', async function () {
						await purchase(from, 3)
						assert.isTrue(await token.transfer.call(to, 1, { from: from }))
						assert.isTrue(await token.transfer.call(to, 2, { from: from }))
						assert.isTrue(await token.transfer.call(to, 3, { from: from }))

						await token.transfer(to, 1, { from: from })
						assert.isTrue(await token.transfer.call(to, 1, { from: from }))
						assert.isTrue(await token.transfer.call(to, 2, { from: from }))
					})

					it('should not affect totalSupply', async function () {
						await purchase(from, 3)
						let supply1 = await token.totalSupply.call()
						await token.transfer(to, 3, { from: from })
						let supply2 = await token.totalSupply.call()
						expect(supply2).to.be.be.bignumber.equal(supply1)
					})

					it('should update balances accordingly', async function () {
						await purchase(from, 3)
						let fromBalance1 = await token.balanceOf.call(from)
						let toBalance1 = await token.balanceOf.call(to)

						await token.transfer(to, 1, { from: from })
						let fromBalance2 = await token.balanceOf.call(from)
						let toBalance2 = await token.balanceOf.call(to)

						if (from == to) {
							expect(fromBalance2).to.be.bignumber.equal(fromBalance1)
						}
						else {
							expect(fromBalance2).to.be.bignumber.equal(fromBalance1.minus(1))
							expect(toBalance2).to.be.bignumber.equal(toBalance1.plus(1))
						}

						await token.transfer(to, 2, { from: from })
						let fromBalance3 = await token.balanceOf.call(from)
						let toBalance3 = await token.balanceOf.call(to)

						if (from == to) {
							expect(fromBalance3).to.be.bignumber.equal(fromBalance2)
						}
						else {
							expect(fromBalance3).to.be.bignumber.equal(fromBalance2.minus(2))
							expect(toBalance3).to.be.bignumber.equal(toBalance2.plus(2))
						}
					})

					it('should fire Transfer event', async function () {
						await testTransferEvent(from, to, 3)
					})

					it('should fire Transfer event when transferring amount of 0', async function () {
						await testTransferEvent(from, to, 0)
					})
				})
			}

			describeTransfer('_to != sender', alice, bob)
			describeTransfer('_to == sender', alice, alice)

			async function testTransferEvent(from, to, amount) {
				if (amount > 0) {
					await purchase(from, amount)
				}

				let result = await token.transfer(to, amount, { from: from })
				let log = result.logs[0]
				assert.equal(log.event, 'Transfer')
				assert.equal(log.args.from, from)
				assert.equal(log.args.to, to)
				expect(log.args.value).to.be.bignumber.equal(amount)
			}
		})

		describe('transferFrom(_from, _to, _value)', function () {
			let describeFrom = function (name, from, via, to) {
				describe('when ' + name + ')', function () {
					beforeEach(async function () {
						// by default approve sender (via) to transfer
						await token.approve(via, 3, { from: from })
					})

					it('should return true when called with amount of 0 and sender is approved', async function () {
						assert.isTrue(await token.transferFrom.call(from, to, 0, { from: via }))
					})

					it('should return true when called with amount of 0 and sender is not approved', async function () {
						assert.isTrue(await token.transferFrom.call(to, from, 0, { from: via }))
					})

					it('should revert when trying to transfer something while _from having nothing', async function () {
						await expectRevertOrFail(token.transferFrom(from, to, 1, { from: via }))
					})

					it('should revert when trying to transfer more than balance of _from', async function () {
						await purchase(from, 2)
						await expectRevertOrFail(token.transferFrom(from, to, 3, { from: via }))
					})

					it('should revert when trying to transfer more than allowed', async function () {
						await purchase(from, 4)
						await expectRevertOrFail(token.transferFrom(from, to, 4, { from: via }))
					})

					it('should return true when transfer can be made', async function () {
						await purchase(from, 3)
						assert.isTrue(await token.transferFrom.call(from, to, 1, { from: via }))
						assert.isTrue(await token.transferFrom.call(from, to, 2, { from: via }))
						assert.isTrue(await token.transferFrom.call(from, to, 3, { from: via }))

						await token.transferFrom(from, to, 1, { from: via })
						assert.isTrue(await token.transferFrom.call(from, to, 1, { from: via }))
						assert.isTrue(await token.transferFrom.call(from, to, 2, { from: via }))
					})

					it('should not affect totalSupply', async function () {
						await purchase(from, 3)
						let supply1 = await token.totalSupply.call()
						await token.transferFrom(from, to, 3, { from: via })
						let supply2 = await token.totalSupply.call()
						expect(supply2).to.be.be.bignumber.equal(supply1)
					})

					it('should update balances accordingly', async function () {
						await purchase(from, 3)
						let fromBalance1 = await token.balanceOf.call(from)
						let viaBalance1 = await token.balanceOf.call(via)
						let toBalance1 = await token.balanceOf.call(to)

						await token.transferFrom(from, to, 1, { from: via })
						let fromBalance2 = await token.balanceOf.call(from)
						let viaBalance2 = await token.balanceOf.call(via)
						let toBalance2 = await token.balanceOf.call(to)

						if (from == to) {
							expect(fromBalance2).to.be.bignumber.equal(fromBalance1)
						}
						else {
							expect(fromBalance2).to.be.bignumber.equal(fromBalance1.minus(1))
							expect(toBalance2).to.be.bignumber.equal(toBalance1.plus(1))
						}

						if (via != from && via != to) {
							expect(viaBalance2).to.be.bignumber.equal(viaBalance1)
						}

						await token.transferFrom(from, to, 2, { from: via })
						let fromBalance3 = await token.balanceOf.call(from)
						let viaBalance3 = await token.balanceOf.call(via)
						let toBalance3 = await token.balanceOf.call(to)

						if (from == to) {
							expect(fromBalance3).to.be.bignumber.equal(fromBalance2)
						}
						else {
							expect(fromBalance3).to.be.bignumber.equal(fromBalance2.minus(2))
							expect(toBalance3).to.be.bignumber.equal(toBalance2.plus(2))
						}

						if (via != from && via != to) {
							expect(viaBalance3).to.be.bignumber.equal(viaBalance2)
						}
					})

					it('should fire Transfer event', async function () {
						await testTransferEvent(from, via, to, 3)
					})

					it('should fire Transfer event when transferring amount of 0', async function () {
						await testTransferEvent(from, via, to, 0)
					})
				})
			}

			describeFrom('_from != _to and _to != sender', alice, bob, charles)
			describeFrom('_from != _to and _to == sender', alice, bob, bob)
			describeFrom('_from == _to and _to != sender', alice, alice, bob)
			describeFrom('_from == _to and _to == sender', alice, alice, alice)

			it('should revert when trying to transfer while not allowed at all', async function () {
				await purchase(alice, 3)
				await expectRevertOrFail(token.transferFrom(alice, bob, 1, { from: bob }))
				await expectRevertOrFail(token.transferFrom(alice, charles, 1, { from: bob }))
			})

			it('should fire Transfer event when transferring amount of 0 and sender is not approved', async function () {
				await testTransferEvent(alice, bob, bob, 0)
			})

			async function testTransferEvent(from, via, to, amount) {
				if (amount > 0) {
					await purchase(from, amount)
				}

				let result = await token.transferFrom(from, to, amount, { from: via })
				let log = result.logs[0]
				assert.equal(log.event, 'Transfer')
				assert.equal(log.args.from, from)
				assert.equal(log.args.to, to)
				expect(log.args.value).to.be.bignumber.equal(amount)
			}
		})
	})
}
