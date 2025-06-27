import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import analyseRoute from './routes/xqanalyse/analyse.js';
import baseRoute from './routes/xqanalyse/base.js';
import initRoute from './routes/xqanalyse/init.js';

const app = express();
const port = 3030;

// Swagger setup
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'XQuery Analyser API',
      version: '1.0.0',
    },
  },
  apis: ['./src/routes/**/*.js'], // files containing annotations as above
};

const openapiSpec = swaggerJsdoc(options);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

// API Routes
app.put('/xqanalyse/analyse', analyseRoute);
app.put('/xqanalyse/base', baseRoute);
app.put('/xqanalyse/init', initRoute);

app.listen(port, () => {
  console.log(`xqanalyze API listening at http://localhost:${port}`);
});
