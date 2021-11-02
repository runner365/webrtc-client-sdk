const { EventEmitter } = require('events');

class EnhancedEventEmitter extends EventEmitter
{
	constructor(logger)
	{
		super();
		this.setMaxListeners(Infinity);
	}

	safeEmit(event, ...args)
	{
		try
		{
			this.emit(event, ...args);
		}
		catch (error)
		{
		}
	}

	async safeEmitAsPromise(event, ...args)
	{
		return new Promise((resolve, reject) =>
		{
			this.safeEmit(event, ...args, resolve, reject);
		});
	}
}

module.exports = EnhancedEventEmitter;
