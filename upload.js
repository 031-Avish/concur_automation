const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const monthNames = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const currentMonth = monthNames[new Date().getMonth()];
const reportName = `January Expenses`;
// path of csv
const csvFilePath = path.resolve(__dirname, 'RideInvoice/processed/output.csv');

// Function to read CSV and return data as an array of objects
const readCsvData = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
};

// Function to convert date to MM/DD/YYYY format
const formatDate = (inputDate) => {
  const date = new Date(inputDate.replace(/(\d+)(th|st|nd|rd)/, '$1')); // Remove ordinal suffixes
  const mm = String(date.getMonth() + 1).padStart(2, '0'); // Month (MM)
  const dd = String(date.getDate()).padStart(2, '0'); // Day (DD)
  const yyyy = date.getFullYear(); // Year (YYYY)
  return `${mm}/${dd}/${yyyy}`;
};

(async () => {
  const csvData = await readCsvData(csvFilePath);
  console.log('Data from CSV:', csvData);
  // Define the path to the session cookies file
  const cookiesPath = path.resolve(__dirname, 'sessionCookies.json');

  // Launch Puppeteer
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Check if session cookies exist
  if (fs.existsSync(cookiesPath)) {
    // Load existing session cookies
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
    await page.setCookie(...cookies);
    console.log('Loaded session cookies.');
  }

  // Navigate to the SAP Concur page
  await page.goto('https://www.concursolutions.com/nui/expense', { waitUntil: 'networkidle2' });

  // Wait for the user profile icon to appear, indicating successful login
  try {
    await page.waitForSelector('button[data-test="menu-profile"]', { timeout: 10000 });
    console.log('Login successful.');
  } catch (error) {
    console.log('Please log in manually.');
    // Wait for the user to log in manually
    await page.waitForSelector('button[data-test="menu-profile"]', { timeout: 0 });
    console.log('Login detected. Saving session cookies...');

    // Save session cookies for future runs
    const cookies = await page.cookies();
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
    console.log('Session cookies saved.');
  }
  // login done now the automation starts 
  // click on create report 
  try {
    const buttonSelector = '.sapcnqr-button__text';
    await page.waitForSelector(buttonSelector, { timeout: 5000 });
    await page.click(buttonSelector);
    console.log("Clicked on the button with class 'sapcnqr-button__text'.");
  } catch (error) {
    console.log("Could not find the button with class 'sapcnqr-button__text'.");
  }

  // const monthNames = ["January", "February", "March", "April", "May", "June",
  //   "July", "August", "September", "October", "November", "December"];
  // const currentMonth = monthNames[new Date().getMonth()];
  // const reportName = `${currentMonth} Expense`;

  // fill the input field 
  await page.waitForSelector('#name', { timeout: 10000 }); // Wait up to 10 seconds
  await page.type('#name', `${reportName}`);
  await page.type('#comment', `${reportName}`);

  // Wait for the "Create Report" button and click it
  await page.waitForSelector('button[type="submit"] .sapcnqr-button__text', { timeout: 10000 });
  await page.click('button[type="submit"] .sapcnqr-button__text');
  console.log('Clicked "Create Report" button.');

  // ######## ADDING THE FOR LOOP
  // Loop through each record in the CSV and automate data entry
  for (const record of csvData) {

    console.log(record);
    const mode = record.mode;
    await new Promise(resolve => setTimeout(resolve, 5000));

    // add new expense
    await page.waitForSelector('button.sapcnqr-button--create[data-toolbar-region="end"]', { timeout: 100000 });
    await page.click('button.sapcnqr-button--create[data-toolbar-region="end"]');
    await page.waitForSelector('button[data-nuiexp="report-createNewExpense-tab"]', { timeout: 100000 });

    await new Promise(resolve => setTimeout(resolve, 3000));

    await page.waitForSelector('button[data-nuiexp="report-createNewExpense-tab"]', { timeout: 200000 });
    await page.click('button[data-nuiexp="report-createNewExpense-tab"]');
    console.log('Clicked "New Expense" tab.');

    // Wait for the "Commute" button and click it
    await page.waitForSelector('button[aria-label="Commute"]', { timeout: 20000 });
    await page.click('button[aria-label="Commute"]');
    console.log('Clicked "Commute" option.');

    // Wait for the "Add Receipt" button and click it
    await page.waitForSelector('button.spend-common__drag-n-drop__button', { timeout: 20000 });
    await page.click('button.spend-common__drag-n-drop__button');
    console.log('Clicked "Add Receipt" button.');

    await page.waitForSelector('#expenseForm', { timeout: 20000 });
    console.log('Form loaded.');

    await page.evaluate(() => window.scrollTo(0, 0));
    console.log('Scrolled to the top of the page.');

    await new Promise(resolve => setTimeout(resolve, 3000));

    await page.waitForSelector('div#custom17', { visible: true });

    // Click the dropdown to expand it
    await page.click('div#custom17');
    console.log('Clicked on "Mode of Transport" dropdown.'); // Open dropdown

    // Wait for the dropdown list to appear

    await page.waitForSelector('div.sapcnqr-selection-list__list-container', { visible: true });

    // await page.waitForSelector('div[role="listbox"]', { visible: true });
    console.log('Dropdown list is visible now.');


    // Select the mode of transport
    if (mode == "Car") {
      await page.evaluate(() => {
        const options = Array.from(document.querySelectorAll('ul[role="listbox"] li'));
        const desiredOption = options.find(option => option.querySelector('div').innerText.includes('Cab/Taxi'));
        if (desiredOption) desiredOption.click();
      });
      console.log('Selected "Cab/Taxi" via simulated interaction.');
    }
    else {
      await page.evaluate(() => {
        const options = Array.from(document.querySelectorAll('ul[role="listbox"] li'));
        const desiredOption = options.find(option => option.querySelector('div').innerText.includes('Auto'));
        if (desiredOption) desiredOption.click();
      });
      console.log('Selected "Auto" via simulated interaction.');
    }


    // Fill "Transaction Date" (input)
    const formattedDate = formatDate(record.dateObj);
    // const formattedDate = record.dateObj;
    await page.type('#transactionDate-date-picker-input', formattedDate);
    console.log('Entered Transaction Date.');

    // Fill "Vendor Name" (text field)
    await page.type('#vendorName', record.vendor);
    console.log('Entered Vendor Name.');

    // Fill "Amount" (input)
    await page.type('#transactionAmount', record.amount);
    console.log('Entered Amount.');
    // Fill "Bill No." (text field)
    await page.type('#custom1', record.invoiceNumber);
    console.log('Entered Bill No.');

    // upload the file
    const filePath = path.resolve(__dirname, `RideInvoice/processed/${record.invoiceNumber}.pdf`);
    // Wait for the hidden file input and set the file path
    await page.waitForSelector('input[type="file"][data-nuiexp="upload-receipt"]', { timeout: 10000 });
    const inputUploadHandle = await page.$('input[type="file"][data-nuiexp="upload-receipt"]');
    await inputUploadHandle.uploadFile(filePath);
    console.log(`Uploaded file from ${filePath}`);
    // wait for file to get uploaded 
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Save the form
    await page.waitForSelector('button[data-nuiexp="save-expense"]', { timeout: 20000 });
    await page.click('button[data-nuiexp="save-expense"]');
    console.log('Clicked "Save Expense" button.');
  }

  // Keep the browser open for review if needed
  console.log('Task completed. Browser will remain open for review.');
})();
