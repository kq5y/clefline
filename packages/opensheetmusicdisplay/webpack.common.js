var path = require('path')
var webpack = require('webpack')

module.exports = {
    entry: {
        opensheetmusicdisplay: './src/index.ts'
    },
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: '[name].js',
        library: {
            name: 'opensheetmusicdisplay',
            type: 'umd',
            umdNamedDefine: true
        },
        globalObject: 'typeof self !== "undefined" ? self : this'
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: 'ts-loader',
                exclude: /(node_modules|bower_components)/
            },
            {
                test: /\.glsl$/,
                type: "asset/source",
                exclude: /(node_modules|bower_components)/
            }
        ]
    },
    plugins: [
        new webpack.EnvironmentPlugin({
            STATIC_FILES_SUBFOLDER: false,
            DEBUG: false,
            DRAW_BOUNDING_BOX_ELEMENT: false
        })
    ]
}
