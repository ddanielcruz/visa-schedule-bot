import 'dotenv/config'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import chalk from 'chalk'
import lodash from 'lodash'
import notifier from 'node-notifier'
import open from 'open'

import { logger } from './logger.js'

const { CONSULATE, EMAIL, PASSWORD, SCHEDULE_ID, HEADLESS, INTERVAL } = process.env

const baseUrl = 'https://ais.usvisa-info.com/pt-br/niv'
const signInUrl = `${baseUrl}/users/sign_in`
const scheduleUrl = `${baseUrl}/schedule/${SCHEDULE_ID}/appointment/days/${CONSULATE}.json?appointments%5Bexpedite%5D=false`
const maximumDate = new Date(2022, 7, 31)
puppeteer.use(StealthPlugin())

async function retrieveConsulateDates(page, retry = true) {
  const response = await page.goto(scheduleUrl)
  const availableDates = await response.json()

  if (!availableDates) {
    if (retry) {
      return await retrieveConsulateDates(page, false)
    }

    throw new Error('Failed to retrieve consulate dates!')
  }

  return availableDates
}

async function notifyClosestDates(dates) {
  const firstDate = new Date(dates[0].date)
  if (firstDate <= maximumDate) {
    notifier.notify({
      title: 'Found dates before the maximum!',
      message: dates.map(({ date }) => date).join(', '),
      sound: true,
      actions: 'Open website',
      time: 5
    })
    await open(baseUrl)
  }
}

async function extractDates() {
  // Launch browser and navigate to VISA page
  logger.debug('Navigating to schedule application')
  const browser = await puppeteer.launch({ headless: HEADLESS === 'true' })

  try {
    const [page] = await browser.pages()
    await page.goto(signInUrl)

    // Populate user credentials and sign in
    logger.debug('Signing in to user profile')
    await page.waitForSelector('#user_email')
    await page.type('#user_email', EMAIL)
    await page.type('#user_password', PASSWORD)
    await page.click('#policy_confirmed')
    await page.click('.new_user input.button')

    // Request schedule available dates and log the five closest ones
    logger.debug(`Requesting available dates from consulate ${chalk.green(CONSULATE)}`)
    await page.waitForSelector('.attend_appointment')
    let availableDates = await retrieveConsulateDates(page)
    availableDates = lodash.sortBy(availableDates, 'date')

    if (availableDates.length) {
      logger.info(`Closest dates in the selected consulate:`)
      const closestDates = availableDates.slice(0, 5)
      closestDates.forEach(({ date }) => logger.info(date))
      notifyClosestDates(closestDates)
    } else {
      logger.error("The consulate doesn't have any available date!")
    }
  } catch (error) {
    logger.error(error.message)
  } finally {
    await browser.close()
  }
}

logger.warn(`Scheduling bot to run every ${INTERVAL} seconds.`)
logger.warn(`Maximum date is set to ${maximumDate.toDateString()}`)

const interval = parseInt(INTERVAL) * 1000
setInterval(async () => {
  await extractDates()
}, interval)
extractDates()
