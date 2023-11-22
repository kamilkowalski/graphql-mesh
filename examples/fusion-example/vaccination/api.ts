import { createSchema, createYoga } from 'graphql-yoga';

export const vaccinationApi = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      scalar BigInt

      type Query {
        petById(id: BigInt!): Pet
      }

      type Pet {
        id: BigInt!
        vaccinated: Boolean!
      }
    `,
    resolvers: {
      Query: {
        petById: async (root, args, context, info) => {
          return {
            id: args.id,
            vaccinated: Math.random() > 0.5,
          };
        },
      },
    },
  }),
});
