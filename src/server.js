import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import analyseRoute from './routes/xqanalyse/analyse.js';
import baseRoute from './routes/xqanalyse/base.js';
import initRoute from './routes/xqanalyse/init.js';
import modulesRoute from './routes/xqanalyse/modules.js';
import functionsRoute from './routes/xqanalyse/functions.js';
import statusRoute from './routes/xqanalyse/status.js';

const app = express();
app.use(cors());
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

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API Routes
app.put('/xqanalyse/analyse', analyseRoute);
app.put('/xqanalyse/base', baseRoute);
app.put('/xqanalyse/init', initRoute);
app.get('/xqanalyse/modules', modulesRoute);
app.get('/xqanalyse/functions', functionsRoute);
app.get('/xqanalyse/status', statusRoute);

app.listen(port, () => {
  console.log(`xqanalyze API listening at http://localhost:${port}`);
});
