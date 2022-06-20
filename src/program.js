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

let browser, page, launchedAt

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

async function launchBrowserAndSign() {
  // If browser was already launched, check if it's older than 15 minutes to launch again
  if (browser) {
    const diffMins = Math.round((Math.abs(Date.now() - launchedAt) / (1000 * 60)) % 60)
    if (diffMins >= 15) {
      logger.debug('Closing browser after 15 minutes')
      await browser.close()
      page = undefined
      browser = undefined
    }
  }

  // Launch a new browser if it's closed
  if (!browser) {
    logger.debug('Navigating to schedule application')
    launchedAt = Date.now()
    browser = await puppeteer.launch({ headless: HEADLESS === 'true' })
    page = (await browser.pages())[0]
    await page.goto(signInUrl)

    logger.debug('Signing in to user profile')
    await page.waitForSelector('#user_email')
    await page.type('#user_email', EMAIL)
    await page.type('#user_password', PASSWORD)
    await page.click('#policy_confirmed')
    await page.click('.new_user input.button')
    await page.waitForSelector('.attend_appointment')
  }
}

async function extractDates() {
  try {
    await launchBrowserAndSign()

    logger.debug(`Requesting available dates from consulate ${chalk.green(CONSULATE)}`)
    let availableDates = await retrieveConsulateDates(page)
    availableDates = lodash.sortBy(availableDates, 'date')

    if (availableDates.length) {
      logger.info('Closest dates in the selected consulate:')
      const closestDates = availableDates.slice(0, 3)
      closestDates.forEach(({ date }) => logger.info(date))
      notifyClosestDates(closestDates)
    } else {
      logger.error("The consulate doesn't have any available date!")
    }
  } catch (error) {
    logger.error(error)
  }
}

logger.warn(`Scheduling bot to run every ${chalk.green(INTERVAL)} seconds.`)
logger.warn(`Maximum date is set to ${maximumDate.toDateString()}`)

const interval = parseInt(INTERVAL) * 1000
setInterval(async () => {
  await extractDates()
}, interval)
extractDates()
