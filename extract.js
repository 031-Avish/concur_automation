const fs = require('fs');
const path = require('path');
const { PdfReader } = require('pdfreader');

// create processed folder if not there 
const processedDir = 'RideInvoice/processed';
if (!fs.existsSync(processedDir)) {
  fs.mkdirSync(processedDir);
}

// function to identify the vendor
function identifyService(text) {
  const lowerText = text.toLowerCase();
  // Check for Rapido
  if (/rapido/i.test(text) || /mode of vehicle/i.test(text)) {
    return "Rapido";
  }
  // Check for Uber
  if (/uber/i.test(text) || /here's your receipt/i.test(text)) {
    return "Uber";
  }
  // Check for Namma Yatri
  if (/final amount paid/i.test(text) || /here'syourinvoicepaymentdetails/i.test(text)) {
    return "NammaYatri";
  }
  return "Unknown Service";
}

//extract namma yatri details
const doForNammaYatri = (filePath, text) => {
  const invoiceRegex = /RideID:\s*(\S+)[^A-Za-z0-9]*DriverName/;
  const vendor = "NammaYatri"
  const amountRegex = /FinalAmountPaid\s*₹\s*(\d+)\s*RideDetails/
  const dateRegex = /(\d{1,2})(?:st|nd|rd|th)?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/;
  // const addressRegex = /\d{1,2}:\d{2}\s*[APM]{2}([\w\s\+,.]+?)\d{1,2}:\d{2}\s*[APM]{2}([\w\s\+,.]+)/;
  const addressRegex = /(\d{1,2}:\d{2}\s*[APM]{2}.*?)(\d{1,2}:\d{2}\s*[APM]{2}.*?)([A-Za-z0-9\s,.-]+)/g;
  const amount = text.match(amountRegex)[1];
  console.log(text.match(amountRegex))
  console.log("line 39 " + text.match(invoiceRegex));
  const invoiceNumber = text.match(invoiceRegex)[1];
  const date = text.match(dateRegex)[0]
  let dateObj;
  if (date) {
    const day = text.match(dateRegex)[1];  // Extracted day (e.g., "4")
    const month = text.match(dateRegex)[2];  // Extracted month (e.g., "Sep")
    const months = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };
    const monthInNumber = months[month];
    let currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    // this is to handle the case when you are in jan or feb and uploading the bills of dec or nov of previous year (as namma yatri receipt do not have year mentioned)
    if (monthInNumber == 9 || monthInNumber == 10 || monthInNumber == 11 && currentMonth == 0 || currentMonth == 1 || currentMonth == 2)
    {  
      currentYear -= 1;
    }
    console.log(currentYear);
    // Create a Date object using the extracted day, month, and current year
    dateObj = new Date(currentYear, months[month], day);
    dateObj.setHours(dateObj.getHours() + 5, dateObj.getMinutes() + 30)
  }

  console.log(text.match(addressRegex))
  const match = text.match(addressRegex);
  const from = match[0].split('...')[0].trim();
  const to = match[0].split('...')[1].trim();
  const output = {
    from,
    to,
    amount,
    invoiceNumber,
    date,
    dateObj,
    mode: "Auto",
    vendor

  };
  const fileName = path.basename(filePath); // Get the original file name
  const newFileName = `${invoiceNumber}.pdf`; // New file name with invoice number
  const newFilePath = path.join(processedDir, newFileName);

  // Copy the file to the processed directory
  fs.copyFile(filePath, newFilePath, (err) => {
    if (err) {
      console.error("Error copying file:", err);
    }
  });
  return output;
}

// extract Rapido details 
const doForRapido = (filePath, text) => {
  const vendor = "Rapido";
  // Define your regex patterns for rapido 
  const invoiceRegex = /RD\d+(?:\s*\d+)?/g;  // To get invoice number 
  const amountRegex = /Selected Price\s*₹\s*(\d+)/; // to get the total amount 
  const dateRegex = /\b(?:Auto|Car|Bike)\b\s*(.*?)(AM|PM)/; // to get the date of invoice 
  const fromAddressRegex = /₹\s*\d+\s*(.*?)This document/s;
  const toAddressRegex = /estimated price range\s*(.*?)(?=\n|$)/s; // get address 
  const invoiceNumber = text.match(invoiceRegex)?.[0].replaceAll(" ", '');
  const amount = text.match(amountRegex)?.[1];
  const dateTimeMatch = text.match(dateRegex);
  // get the mode of transport ( Car or Auto )
  let mode = dateTimeMatch[0].split(" ")[0];
  if(mode=="Auto" || mode=="Bike"){
    mode="Auto"
  }
  else{
    mode="Car"
  }
  let date = dateTimeMatch[1].trim().replace(/(\d+)(th|st|nd|rd)/, '$1');
  const dateArray = date.split(', ');
  if (dateArray[0].split(" ").length - 1 === 3) {
    dateArray[0] = dateArray[0].replace(/(\d) (\d)/g, '$1$2')
  }
  dateArray[1] = dateArray[1].replaceAll(' ', '');
  date = dateArray.join(', ') + ' ' + dateTimeMatch[2];
  const from = text.match(fromAddressRegex)?.[1];
  const to = text.match(toAddressRegex)?.[1];
  const output = {
    invoiceNumber,
    amount,
    date,
    dateObj: new Date(date),
    from,
    to,
    mode,
    vendor
  };
  const fileName = path.basename(filePath); // Get the original file name
  const newFileName = `${invoiceNumber}.pdf`; // New file name with invoice number
  const newFilePath = path.join(processedDir, newFileName);

  // Copy the file to the processed directory
  fs.copyFile(filePath, newFilePath, (err) => {
    if (err) {
      console.error("Error copying file:", err);
    }
  });

  return output;
}

// extract uber details
const doForUber = (filePath, text) => {
  const vendor = "Uber";
  // Define your regex patterns for uber 
  const invoiceRegex = /License Plate:\s*(.*?)\s*Fares/;
  const amountRegex = /₹(\d+\.\d+)/; // Match ₹ followed by digits and decimal
  const dateRegex = /\b(?:\d{1,2}min|\d{1,2}min\(s\))?\s*([A-Za-z]+\s\d{1,2},?\s\d{4}|\d{1,2}\s[A-Za-z]+\s\d{4})/;
  text = text.split('|')
  console.log(text);
  let mode = "Car" 
  if (/Auto/i.test(text) || /Moto/i.test(text)) {
    mode = "Auto"
  }
  const from = text[1].trim();
  const to = text[2].trim();
  const amount = text[3].match(amountRegex)[1];
  let invoiceNumber = '';
  try {
    invoiceNumber = text[3].match(invoiceRegex)[1];
  } catch {
    console.log(text.length)
  }
  console.log(text[3].match(dateRegex));
  const dateExtract = text[3].match(dateRegex)[1];
  console.log(dateExtract);
  const date = dateExtract
  const dateObj = new Date(new Date(dateExtract));
  console.log(dateObj);
  dateObj.setHours(dateObj.getHours() + 5, dateObj.getMinutes() + 30)

  const output = {
    invoiceNumber,
    amount,
    date,
    dateObj,
    from,
    to,
    mode,
    vendor
  };
  const fileName = path.basename(filePath); // Get the original file name
  const newFileName = `${invoiceNumber}.pdf`; // New file name with invoice number
  const newFilePath = path.join(processedDir, newFileName);

  // Copy the file to the processed directory
  fs.copyFile(filePath, newFilePath, (err) => {
    if (err) {
      console.error("Error copying file:", err);
    }
  });
  return output;
}
// Function to process a single PDF file and save to the 
const processPdfFileRapido = (filePath) => {

  return new Promise((resolve, reject) => {
    let text = '';

    fs.readFile(filePath, (err, pdfBuffer) => {
      if (err) return reject(`Error reading file ${filePath}: ${err}`);
      new PdfReader().parseBuffer(pdfBuffer, (err, item) => {
        if (err) return reject(`Error parsing PDF ${filePath}: ${err}`);
        else if (!item) {
          // clean the text in case of rapido
          const textUsedForRapido = text.replaceAll("  ", " ");
          // overall clean the text
          text = text.replace(/(?<! ) (?! )/g, '').replace(/ {2,}/g, ' ');
          console.log("text" + text);

          // check the vendor (rapido or uber or namma yatri )
          const service = identifyService(text);
          if (service == "Rapido") {
            const output = doForRapido(filePath, textUsedForRapido); // pass text of rapido 
            resolve(output);
          }
          else if (service == "Uber") {
            const output = doForUber(filePath, text);
            resolve(output);
          }
          else if (service == "NammaYatri") {
            const output = doForNammaYatri(filePath, text);
            resolve(output);
          }
          else {
            reject(`Unknown service: ${service}`);
          }
        } else if (item.text) {
          text += item.text.toString() + ' ';
        }
      });
    });
  });
};


// Main function to iterate over files and extract data
const extractDataFromFiles = async () => {
  const directoryPath = 'RideInvoice/';
  let jsonArray = [];

  fs.readdir(directoryPath, async (err, files) => {
    if (err) return console.error("Error reading directory:", err);

    const pdfFiles = files.filter(file => file.endsWith('.pdf')); // Filter for PDF files

    for (const file of pdfFiles) {
      const filePath = `${directoryPath}/${file}`;
      try {
        const data = await processPdfFileRapido(filePath);
        jsonArray.push(data);
      } catch (error) {
        console.error(error);
      }
    }

    // Output the JSON array
    jsonArray = jsonArray.map(receipt => ({
      ...receipt,
      ...exclusionInfo(receipt)

    }))
    console.log(JSON.stringify(jsonArray, null, 2));
    writeJsonArrayToCsv(jsonArray)
  });
};

// helper funtion
function exclusionInfo(receipt) {
  const exclusion = {
    isExcluded: false,
    exclusionMessage: 'not excluded'
  }
  let isWeekend = true;
  let isWrongAddress = true;

  const dayOfWeek = receipt.dateObj.getDay();
  isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

  if ((receipt.to.includes('Bellandur')) || receipt.from.includes('Bellandur')) {
    isWrongAddress = false;
  }

  if (isWeekend) {
    exclusion.isExcluded = true
    exclusion.exclusionMessage = 'weekend trip'
  } else if (isWrongAddress) {
    exclusion.isExcluded = true
    exclusion.exclusionMessage = 'address is wrong'
  }
  return exclusion;
}

// function to write to the csv file 
const writeJsonArrayToCsv = (data) => {
  const csvRows = [];
  const headers = Object.keys(data[0]);
  csvRows.push(headers.join(',')); // Add the headers

  // Add data rows
  for (const row of data) {
    const values = headers.map(header => JSON.stringify(row[header])); // Stringify values to handle commas
    csvRows.push(values.join(','));
  }

  // Create CSV file
  const csvData = csvRows.join('\n');
  const csvFilePath = path.join(processedDir, 'output.csv');

  fs.writeFile(csvFilePath, csvData, (err) => {
    if (err) {
      console.error("Error writing CSV file:", err);
    } else {
      console.log(`CSV file created at: ${csvFilePath}`);
    }
  });
};


// Run the extraction process ( call main function)
extractDataFromFiles();
