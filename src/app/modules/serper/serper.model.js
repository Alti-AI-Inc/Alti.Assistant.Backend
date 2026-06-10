/**
 * @file Defines the Sequelize model for storing Serper search history.
 * @module models/SerperSearch
 */

'use strict';

const { Model } = require('sequelize');

/**
 * Exports a function that defines the SerperSearch model.
 * This model is used to store records of searches performed using the Serper API.
 *
 * @param {import('sequelize').Sequelize} sequelize - The Sequelize instance.
 * @param {import('sequelize').DataTypes} DataTypes - The Sequelize data types.
 * @returns {typeof Model} The initialized SerperSearch model.
 */
module.exports = (sequelize, DataTypes) => {
  /**
   * @class SerperSearch
   * @classdesc Represents a single search performed via the Serper API. It captures the user,
   * the tenant, the query, and the results for logging and history purposes.
   * @extends Model
   */
  class SerperSearch extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     * @static
     * @param {object} models - An object containing all the models.
     */
    static associate(models) {
      // define association here
    }
  }

  SerperSearch.init({
    /**
     * The unique identifier for the search record.
     * @type {number}
     * @primaryKey
     * @autoIncrement
     */
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER
    },
    /**
     * The UUID of the tenant to which this search record belongs.
     * Essential for multi-tenancy data isolation.
     * @type {string}
     * @foreignKey
     */
    tenantId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'Identifier for the tenant who owns this search record.'
    },
    /**
     * The UUID of the user who initiated the search.
     * @type {string}
     * @foreignKey
     */
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'Identifier for the user who performed the search.'
    },
    /**
     * The search query string submitted by the user.
     * @type {string}
     */
    query: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'The search query string.'
    },
    /**
     * The complete JSON response received from the Serper API.
     * @type {object}
     */
    results: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'The JSON results returned by the Serper API.'
    },
    /**
     * The parameters used for the search query (e.g., location, language).
     * @type {object}
     */
    searchParameters: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'The parameters used to perform the search.'
    }
  }, {
    sequelize,
    modelName: 'SerperSearch',
    tableName: 'serper_searches',
    timestamps: true
  });

  return SerperSearch;
};