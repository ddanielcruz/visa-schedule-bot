import 'dotenv/config'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import chalk from 'chalk'
import lodash from 'lodash'

const { CONSULATE, EMAIL, PASSWORD, SCHEDULE_ID, HEADLESS } = process.env

const baseUrl = 'https://ais.usvisa-info.com/pt-br/niv'
const signInUrl = `${baseUrl}/users/sign_in`
const scheduleUrl = `${baseUrl}/schedule/${SCHEDULE_ID}/appointment/days/${CONSULATE}.json?appointments%5Bexpedite%5D=false`

puppeteer.use(StealthPlugin())

async function program() {
  // Launch browser and navigate to VISA page
  console.log(chalk.green(`Launching browser and navigating to VISA page`))
  const browser = await puppeteer.launch({ headless: HEADLESS === 'true' })
  const [page] = await browser.pages()
  await page.goto(signInUrl)

  // Populate user credentials and sign in
  console.log('Signing in to user profile')
  await page.waitForSelector('#user_email')
  await page.type('#user_email', EMAIL)
  await page.type('#user_password', PASSWORD)
  await page.click('#policy_confirmed')
  await page.click('.new_user input.button')

  // Request schedule available dates and log the five closest ones
  console.log(`Requesting available dates from consulate ${chalk.green(CONSULATE)}`)
  const response = await page.goto(scheduleUrl)
  let availableDates = await response.json()
  availableDates = lodash.sortBy(availableDates, 'date')

  console.log(chalk.green('\nClosest dates in the selected consulate:'))
  for (const availableDate of availableDates.slice(0, 5)) {
    console.log(chalk.yellow(availableDate.date))
  }

  // Close operation
  await browser.close()
}

program()
