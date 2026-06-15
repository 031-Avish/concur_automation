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
  if (/final\s*amount\s*paid/i.test(text) || /here'syourinvoicepaymentdetails/i.test(text)) {
    return "NammaYatri";
  }
  return "Unknown Service";
}

//extract namma yatri details
const doForNammaYatri = (filePath, text) => {
  const invoiceRegex = /RideID:\s*(\S+?)(?=Driver)/i;
  const vendor = "NammaYatri"
  const amountRegex = /FinalAmountPaid\s*₹\s*(\d+)\s*RideDetails/
  const dateRegex = /(\d{1,2})(?:st|nd|rd|th)?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/;
  const amount = text.match(amountRegex)[1];
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
    if ((monthInNumber == 9 || monthInNumber == 10 || monthInNumber == 11) && (currentMonth == 0 || currentMonth == 1 || currentMonth == 2))
    {  
      currentYear -= 1;
    }
    console.log(currentYear);
    // Create a Date object using the extracted day, month, and current year
    dateObj = new Date(currentYear, months[month], day);
    dateObj.setHours(dateObj.getHours() + 5, dateObj.getMinutes() + 30)
  }

  const licPlateIdx = text.toLowerCase().indexOf('licenseplate');
  const afterLicensePlate = licPlateIdx >= 0 ? text.slice(licPlateIdx) : text;
  const nyAddressRegex = /\d{1,2}:\d{2}\s*(?:AM|PM)(.*?)India/gi;
  const addrMatches = [...afterLicensePlate.matchAll(nyAddressRegex)];
  const from = addrMatches[0]?.[1]?.replace(/^,\s*/, '').trim() || '';
  const to = addrMatches[1]?.[1]?.replace(/^,\s*/, '').trim() || '';
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
  const dateRegex = /([A-Za-z]{3,9}\s*\d{1,2}(?:st|nd|rd|th)?\s*\d{4}[,]?\s*\d{1,2}:\d{2}\s*(AM|PM))/i; // to get the date of invoice
  const modeNearDateRegex = /(Auto|Car|Bike)\s*(?=(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i;
  const fromAddressRegex = /₹\s*\d+\s*(.*?)This document/s;
  const toAddressRegex = /estimated price range\s*(.*?)(?=\n|$)/s; // get address 
  const invoiceNumber = text.match(invoiceRegex)?.[0].replaceAll(" ", '');
  const amount = text.match(amountRegex)?.[1];
  // OCR can split hour digits like "1 1:12 AM"; normalize that before date extraction.
  const rapidoDateText = text
    .replace(/\b(\d)\s+(\d:\d{2}\s*(?:AM|PM))\b/gi, '$1$2')  // fix split hour: "1 1:12 AM" → "11:12 AM"
    .replace(/\b(\d)\s+(\d(?:st|nd|rd|th))\b/gi, '$1$2');    // fix split day: "1 1th" → "11th"
  const dateTimeMatch = rapidoDateText.match(dateRegex);

  // Default to Auto when mode token is missing (bike invoices do not include "Mode of Vehicle").
  let mode = "Auto";
  const modeMatch = text.match(modeNearDateRegex);
  if (modeMatch?.[1]) {
    mode = /Car/i.test(modeMatch[1]) ? "Car" : "Auto";
  }

  // Normalize compact strings like Apr2nd2026,11:54AM to a Date-friendly format.
  let date = dateTimeMatch?.[1] || "";
  date = date
    .replace(/([A-Za-z]{3,9})(\d)/, '$1 $2')
    .replace(/(\d{4}),?(\d{1,2}:\d{2})/, '$1, $2')
    .replace(/(\d)(AM|PM)$/i, '$1 $2')
    .replace(/(\d+)(th|st|nd|rd)/i, '$1')
    .replace(/\s+/g, ' ')
    .trim();
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
  let from, to, amount, invoiceNumber, date, dateObj;
  let mode = "Car";
  if (/Auto/i.test(text) || /Moto/i.test(text)) {
    mode = "Auto";
  }

  if (text.includes('|')) {
    // Old format with pipe separators
    const invoiceRegex = /License\s*Plate:\s*([A-Z0-9 ]{6,20}?)(?=\s*Fares|\s*$)/i;
    const amountRegex = /₹(\d+\.\d+)/;
    const dateRegex = /\b(?:\d{1,2}min|\d{1,2}min\(s\))?\s*([A-Za-z]+\s\d{1,2},?\s\d{4}|\d{1,2}\s[A-Za-z]+\s\d{4})/;
    const parts = text.split('|');
    from = parts[1]?.trim() || '';
    to = parts[2]?.trim() || '';
    amount = parts[3]?.match(amountRegex)?.[1] || '';
    try {
      invoiceNumber = parts[3]?.match(invoiceRegex)?.[1].replace(/\s+/g, '') || '';
    } catch {
      invoiceNumber = '';
    }
    const dateExtract = parts[3]?.match(dateRegex)?.[1] || '';
    date = dateExtract;
    dateObj = new Date(dateExtract);
    dateObj.setHours(dateObj.getHours() + 5, dateObj.getMinutes() + 30);
  } else {
    // New format (no pipe separators)
    const amountRegex = /Total₹(\d+\.?\d*)/;
    const dateRegex = /([A-Za-z]+ \d+, \d{4})/;
    const licenseRegex = /License\s*Plate:\s*([A-Z0-9 ]+?)(?=\d{1,2}:\d{2})/i;

    amount = text.match(amountRegex)?.[1] || '';
    date = text.match(dateRegex)?.[1] || '';
    dateObj = date ? new Date(date) : new Date();
    dateObj.setHours(dateObj.getHours() + 5, dateObj.getMinutes() + 30);
    invoiceNumber = text.match(licenseRegex)?.[1]?.replace(/\s+/g, '') || '';

    // Addresses appear after LicensePlate, each preceded by a time like "11:18am"
    const licPlateIdx = text.toLowerCase().indexOf('licenseplate:');
    const afterLicensePlate = licPlateIdx >= 0 ? text.slice(licPlateIdx) : text;
    const addrMatches = [...afterLicensePlate.matchAll(/\d{1,2}:\d{2}\s*(?:am|pm)(.*?)India/gi)];
    from = addrMatches[0]?.[1]?.trim() || '';
    to = addrMatches[1]?.[1]?.trim() || '';
  }

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
