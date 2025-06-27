import swaggerJsdoc from 'swagger-jsdoc';
import fs from 'fs';
import path from 'path';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'XQuery Analyser API',
      version: '1.0.0',
      description: 'An API for running XQuery analysis commands.'
    },
  },
  apis: ['./src/routes/**/*.js'], // Path to the API docs
};

const openapiSpec = swaggerJsdoc(options);

const outputPath = path.resolve(process.cwd(), 'docs', 'api');
if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
}

fs.writeFileSync(path.join(outputPath, 'swagger.json'), JSON.stringify(openapiSpec, null, 2));

console.log('API specification generated at docs/api/swagger.json');
