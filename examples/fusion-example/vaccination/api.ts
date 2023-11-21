import { createRouter, Response, Type } from 'fets';

export const vaccinationApi = createRouter().route({
  path: '/pet/:id',
  operationId: 'petById',
  method: 'GET',
  schemas: {
    request: {
      params: Type.Object({
        id: Type.Any(),
      }),
    },
    responses: {
      200: Type.Object(
        {
          id: Type.Integer({ format: 'int64' }),
          vaccinated: Type.Boolean(),
        },
        { title: 'Pet' },
      ),
    },
  },
  handler(request) {
    return Response.json({
      id: parseInt(request.params.id) as any,
      vaccinated: Math.random() > 0.5,
    });
  },
});
