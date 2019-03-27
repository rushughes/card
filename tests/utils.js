const eth = require('ethers')
const provider = new eth.providers.JsonRpcProvider(Cypress.env('provider'))
const wallet = eth.Wallet.fromMnemonic(Cypress.env('mnemonic')).connect(provider)

// Exported object, attach stuff to this that you want available in tests
const my = {}

////////////////////////////////////////
// Vanilla cypress compilations
// These functions behave a lot like cy.whatever functions

my.mnemonicRegex = /([A-Za-z]{3,}\s?){12}/
my.addressRegex = /.*0x[0-9a-z]{40}.*/i

// wait until the startup modal closes
my.doneStarting = () => cy.contains('span', /starting/i).should('not.exist')

my.goToDeposit = () => cy.get(`a[href="/deposit"]`).click() && my.doneStarting()
my.goToSettings = () => cy.get(`a[href="/settings"]`).click() && my.doneStarting()
my.goToReceive = () => cy.get(`a[href="/receive"]`).click() && my.doneStarting()
my.goToSend = () => cy.get(`a[href="/send"]`).click() && my.doneStarting()
my.goToCashout = () => cy.get(`a[href="/cashout"]`).click() && my.doneStarting()
my.goHome = () => cy.contains('button', /^home$/i).click() && my.doneStarting()
my.goBack = () => cy.contains('button', /^back$/i).click() && my.doneStarting()
my.goNextIntro = () => cy.contains('button', /^next$/i).click() && my.doneStarting()
my.goCloseIntro = () => cy.contains('button', /^got it!$/i).click() && my.doneStarting()

my.closeIntroModal = () => {
  // Click through intro modal
  my.goNextIntro()
  my.goNextIntro()
  cy.contains('button', my.mnemonicRegex).should('exist')
  my.goNextIntro()
  // Make sure $?.?? placeholders have been replaced with real values
  cy.contains('p', '??').should('not.exist')
  my.goNextIntro()
  cy.contains('p', '??').should('not.exist')
  my.goCloseIntro()
  my.doneStarting()
}

my.burnCard = (isCollateralized) => {
  my.goToSettings()
  cy.contains('button', /burn card/i).click()
  cy.contains('button', /burn$/i).click()
  if (isCollateralized) cy.contains('span', /processing withdrawal/i).should('exist')
  cy.contains('p', /burning/i).should('exist')
  if (isCollateralized) cy.contains('span', /processing withdrawal/i).should('not.exist')
  cy.contains('p', /burning/i).should('not.exist')
  my.closeIntroModal()
}

my.restoreMnemonic = (mnemonic) => {
  my.goToSettings()
  cy.contains('button', /import/i).click()
  cy.get('input[type="text"]').type(mnemonic)
  cy.get('button').find('svg').click()
  my.goBack()
  my.doneStarting()
}

my.pay = (to, value) => {
  my.goToSend()
  cy.get('input[type="string"]').type(to)
  cy.get('input[type="number"]').type(value)
  cy.contains('button', /send/i).click()
  cy.contains('h5', /in progress/i).should('exist')
}

// TODO: check the reciepient balance before and after to confirm they got the cashout
my.cashout = (to) => {
  const recipient = to || wallet.address
  my.goToCashout()
  cy.log(`cashing out to ${recipient}`)
  cy.get('input[type="text"]').type(recipient)
  cy.contains('button', /cash out eth/i).click()
  cy.contains('span', /processing withdrawal/i).should('exist')
  cy.contains('span', /processing withdrawal/i).should('not.exist')
  cy.wait(3000)
  my.getBalance().then(balance => {
    expect(balance).to.equal('0.00')
  })
}

////////////////////////////////////////
// Data handling & external promise functions

// Cypress needs control over the order things run in, so normal async/promises don't work right
// Gotta wrap traditional promises in `cy.wrap(promise)` so cypress can handle it properly
// Also need to return data via a Cypress.Promise

my.getAddress = () => {
  return new Cypress.Promise((resolve, reject) => {
    my.goToDeposit()
    cy.contains('button', my.addressRegex).invoke('text').then(address => {
      cy.log(`Got address: ${address}`)
      my.goBack()
      resolve(address)
    })
  })
}

my.getMnemonic = () => {
  return new Cypress.Promise((resolve, reject) => {
    my.goToSettings()
    cy.contains('button', my.mnemonicRegex).should('not.exist')
    cy.contains('button', /backup phrase/i).click()
    cy.contains('button', my.mnemonicRegex).should('exist')
    cy.contains('button', my.mnemonicRegex).invoke('text').then(mnemonic => {
      cy.log(`Got mnemonic: ${mnemonic}`)
      my.goBack()
      resolve(mnemonic)
    })
  })
}

my.getAccount = () => {
  return new Cypress.Promise((resolve, reject) => {
    return my.getMnemonic().then(mnemonic => {
      return my.getAddress().then(address => {
        return resolve({ address, mnemonic })
      })
    })
  })
}

my.getBalance = () => {
  return cy.wrap(new Cypress.Promise((resolve, reject) => {
    cy.get('h1').children('span').invoke('text').then(whole => {
      cy.get('h3').children('span').invoke('text').then(fraction => {
        cy.log(`Got balance: ${whole}${fraction}`)
        resolve(`${whole}${fraction}`)
      })
    })
  }))
}

my.deposit = (to, value) => {
  return new Cypress.Promise((resolve, reject) => {
    cy.log(`Depositing ${value} eth into channel ${to}`)
    return cy.wrap(wallet.sendTransaction({
      to: to,
      value: eth.utils.parseEther(value)
    })).then(tx => {
      cy.log(`Transaction sent, waiting for it to get mined..`)
      return cy.wrap(wallet.provider.waitForTransaction(tx.hash).then(() => {
        cy.log(`Transaction mined, waiting for the deposit to be accepted..`)
        cy.contains('span', /processing deposit/i).should('exist')
        cy.contains('span', /processing deposit/i).should('not.exist')
        // TODO: Remove the following race condition
        // see https://github.com/cypress-io/cypress/issues/3109 for more info
        cy.wait(5000)
        my.getBalance().then(balance => {
          expect(balance).to.not.equal('0.00')
          resolve(balance)
        })
      }))
    })
  })
}

my.linkPay = (value) => {
  return new Cypress.Promise((resolve, reject) => {
    my.goToSend()
    cy.get('input[type="number"]').type(value)
    cy.contains('button', /link/i).click()
    cy.contains('button', Cypress.env('publicUrl')).invoke('text').then(redeemLink => {
      resolve(redeemLink)
    })
  })
}

export default my
