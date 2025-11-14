exports.generateAutoSubmitHTML = (proteanUrl, jsonString) => {
  return `
    <html>
    <head>
        <title>Redirecting...</title>
        <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta http-equiv="Pragma" content="no-cache" />
        <meta http-equiv="Expires" content="0" />
        <script>
            window.onload = function() {
                document.forms['redirectForm'].submit();
            }
        </script>
    </head>
    <body>
        <form id="redirectForm" name="redirectForm" method="POST" action="${proteanUrl}">
            <input type="hidden" name="Data" value='${jsonString}' />
        </form>
        <center>Redirecting to PAN Application...</center>
    </body>
    </html>
    `;
};
