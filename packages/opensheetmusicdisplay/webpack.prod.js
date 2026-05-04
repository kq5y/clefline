const { merge } = require('webpack-merge');
var webpack = require('webpack')
var path = require('path')
var common = require('./webpack.common.js')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')

module.exports = merge(common, {
    output: {
        filename: '[name].min.js',
        path: path.resolve(__dirname, 'build')
    },
    mode: 'production',
    optimization: {
        minimize: true
    },
    plugins: [
        new CleanWebpackPlugin({
            verbose: false,
            dry: false,
            cleanOnceBeforeBuildPatterns: ['**/*']
        }),
        new webpack.LoaderOptionsPlugin({
            minimize: true,
            debug: true
        })
    ]
})
