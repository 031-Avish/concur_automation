# Concur Automation

## Prerequisites

Ensure you have **Node.js** installed on your system before running the project.

## Steps to Run the Project

### 1. Clone the Project
Open a terminal and run the following command to clone the repository:  

```sh
git clone https://github.com/031-Avish/concur_automation.git
```

### 2. Change Directory
Navigate into the project directory:

``` sh
cd concur_automation
```

### 3. Install Dependencies
Install all required dependencies using:

```sh
npm install
```

#### Note:
 Above 3 steps are needed only one time. Form the second time open the concur_automation folder in any ide (vs code for easy convenience )
### 4. Prepare Invoice Files
Place all Uber, Rapido, and Namma Yatri invoices inside the RideInvoice folder.

⚠️ Important: Ensure you delete any old invoices and the processed folder inside RideInvoice before proceeding.

### 5. Extract Data from PDF Invoices
Run the following command to extract data from the invoice PDFs ( make sure you are inside concur_automation folder):

```sh
node extract.js
```
### 6. Upload Expenses to Concur
Execute the following command to start the upload process:

```sh
node upload.js
```

This will open a Chrome browser where you need to log in with your Concur credentials.

Keep the browser open until all your expenses are uploaded successfully.



