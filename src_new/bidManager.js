var CONFIG = require("./config.js");
var CONSTANTS = require("./constants.js");
var util = require("./util.js");
var bmEntry = require("./bmEntry.js")
//var PWT = require("./owt").PWT;
//var PWT = window.PWT;
//PWT.bidIdMap = {}; // bidID => {slotID, adapterID}

//todo: is it required ?
var stringBidders = "bidsFromBidders";
var stringBidSizes = "adSlotSizes";

function createBidEntry(divID){
	if(! util.isOwnProperty(PWT.bidMap, divID) ){
		PWT.bidMap[divID] = bmEntry.createBMEntry(divID);
	}
}

exports.setSizes = function(divID, slotSizes){
	createBidEntry(divID);
	PWT.bidMap[divID].setSizes(slotSizes);
};

exports.setCallInitTime = function(divID, adapterID){
	createBidEntry(divID);
	PWT.bidMap[divID].setAdapterEntry(adapterID);
};

exports.setBidFromBidder = function(divID, bidDetails){

	var bidderID = bidDetails.getAdapterID();
	var bidID = bidDetails.getBidID();
	var bidMapEntry = PWT.bidMap[divID];

	if(!util.isOwnProperty(PWT.bidMap, divID)){
		util.log("BidManager is not expecting bid for "+ divID +", from " + bidderID);
		return;
	}

	var currentTime = util.getCurrentTimestampInMs(),
		// move to a function
		isPostTimeout = (bidMapEntry.getCreationTime()+CONFIG.getTimeout()) < currentTime ? true : false
	;

	createBidEntry(divID);

	util.log("BdManagerSetBid: divID: "+divID+", bidderID: "+bidderID+", ecpm: "+bidDetails.getGrossEcpm() + ", size: " + bidDetails.getWidth()+"x"+bidDetails.getHeight() + ", postTimeout: "+isPostTimeout);
	
	bidDetails.setReceivedTime(currentTime);
	if(isPostTimeout === true){
		bidDetails.setPostTimeoutStatus();
	}

	var lastBidID = bidMapEntry.getLastBidIDForAdapter(bidderID);
	if(lastBidID != ""){

		var lastBid = bidMapEntry.getBid(bidderID, lastBidID), //todo: what if the lastBid is null
			lastBidWasDefaultBid = lastBid.getDefaultBidStatus() === 1
			;

		if( lastBidWasDefaultBid || !isPostTimeout){				

			if(lastBidWasDefaultBid){
				util.log(CONSTANTS.MESSAGES.M23);
			}

			if( lastBidWasDefaultBid || lastBid.getNetEcpm() < bidDetails.getNetEcpm() ){
				util.log(CONSTANTS.MESSAGES.M12+lastBid.getNetEcpm()+CONSTANTS.MESSAGES.M13+bidDetails.getNetEcpm()+CONSTANTS.MESSAGES.M14);
				storeBidInBidMap(divID, bidderID, bidDetails, currentTime);				
			}else{
				util.log(CONSTANTS.MESSAGES.M12+lastBid.getNetEcpm()+CONSTANTS.MESSAGES.M15+bidDetails.getNetEcpm()+CONSTANTS.MESSAGES.M16);
			}				
		}else{
			util.log(CONSTANTS.MESSAGES.M17);
		}
	}else{
		util.log(CONSTANTS.MESSAGES.M18);
		storeBidInBidMap(divID, bidderID, bidDetails, currentTime);		
	}		
};

function storeBidInBidMap(slotID, adapterID, theBid, currentTime){
	PWT.bidMap[slotID].setNewBid(adapterID, theBid);
	PWT.bidIdMap[theBid.getBidID()] = {
		s: slotID,
		a: adapterID
	};

	if(bidDetails.getDefaultBidStatus() === 0){
		/*utilVLogInfo(slotID, {
			type: "bid",
			bidder: adapterID + (CONFIG.getBidPassThroughStatus(adapterID) !== 0 ? '(PT)' : ''),
			bidDetails: theBid,
			startTime: PWT.bidMap[slotID].getCreationTime(),
			endTime: currentTime
		});*/
	}
}

exports.resetBid = function(divID, impressionID){
	//utilVLogInfo(divID, {type: "hr"});//todo
	delete PWT.bidMap[divID];
	createBidEntry(divID);
	PWT.bidMap[divID].setImpressionID(impressionID);
};

function auctionBids(bmEntry){	
	var winningBid = null,
		keyValuePairs = {}
	;

	util.forEachOnObject(bmEntry.adapters, function(adapterID, adapterEntry){
		if(adapterEntry.getLastBidID() != ""){
			util.forEachOnObject(adapterEntry.bids, function(bidID, theBid){
				// do not consider post-timeout bids
				if(theBid.getPostTimeoutStatus() === true){
					return;
				}

				//	if bidPassThrough is not enabled and ecpm > 0
				//		then only append the key value pairs from partner bid				
				if(CONFIG.getBidPassThroughStatus(adapterID) === 0 && theBid.getNetEcpm() > 0){
					util.copyKeyValueObject(keyValuePairs, theBid.getKeyValuePairs());
				}

				//BidPassThrough: Do not participate in auction)
				if(CONFIG.getBidPassThroughStatus(adapterID) !== 0){
					util.copyKeyValueObject(keyValuePairs, theBid.getKeyValuePairs());
					return;
				}

				if(winningBid == null){
					winningBid = theBid;
				}else if(winningBid.getNetEcpm() < theBid.getNetEcpm()){
					winningBid = theBid;
				}
			});
		}
	});

	return {
		wb: winningBid,
		kvp: keyValuePairs
	};
}

exports.getBid = function(divID){

	var winningBid = null;
	var keyValuePairs = null;

	if( util.isOwnProperty(PWT.bidMap, divID) ){
		var data = auctionBids(PWT.bidMap[divID]);
		winningBid = data.wb;
		keyValuePairs = data.kvp;		
		PWT.bidMap[divID].setAnalyticEnabled();//Analytics Enabled

		if(winningBid && winningBid.getNetEcpm() > 0){
			winningBid.setStatus(1);
			winningBid.setWinningBidStatus();
			//todo
			/*utilVLogInfo(divID, {
				type: "win-bid",
				bidDetails: winningBid
			});*/
		}else{
			//todo
			/*utilVLogInfo(divID, {
				type: "win-bid-fail",
			});*/
		}
	}

	return {wb: winningBid, kvp: keyValuePairs};
};

exports.getBidById = function(bidID){

	if(!util.isOwnProperty(PWT.bidIdMap, bidID)){
		util.log("Bid details not found for bidID: " + bidID);
		return null;
	}

	var divID = PWT.bidIdMap[bidID].s;
	var adapterID = PWT.bidIdMap[bidID].a;

	if( util.isOwnProperty(PWT.bidMap, divID) ){	
		util.log(bidID+": "+divID+CONSTANTS.MESSAGES.M19+ adapterID);			
		var theBid = PWT.bidMap[divID].getBid(adapterID, bidID);
			
		if(theBid == null){
			return null;
		}

		return {
			bid: theBid,
			slotid: divID
		};
	}

	util.log("Bid details not found for bidID: " + bidID);
	return null;
};

exports.displayCreative = function(theDocument, bidID){
	var bidDetails = this.getBidById(bidID);
	if(bidDetails){
		var theBid = bidDetails.bid,
			divID = bidDetails.slotid
		;
		util.displayCreative(theDocument, theBid);
		//utilVLogInfo(divID, {type: 'disp', adapter: adapterID});
		this.executeMonetizationPixel(divID, theBid);
	}
};

// todo: accept PWT.bidMap as parameter
// todo: changes required for new stucture
exports.executeAnalyticsPixel = function(){

	var selectedInfo = {},
		outputObj = {},
		firePixel = false,
		impressionID = "",
		pixelURL = CONFIG.getAnalyticsPixelURL()
		;

	if(!pixelURL){
		return;
	}

	outputObj["s"] = [];

	for(var key in PWT.bidMap){

		if(! util.isOwnProperty(PWT.bidMap, key)){
			continue;
		}

		var startTime = PWT.bidMap[key].getCreationTime();
		if(util.isOwnProperty(PWT.bidMap, key) && PWT.bidMap[key].exp !== false && PWT.bidMap[key]["ae"] === true ){

			PWT.bidMap[key].exp = false;

			var slotObject = {
				"sn": key,
				"sz": PWT.bidMap[key][stringBidSizes],
				"ps": []
			};

			selectedInfo[key] = {};

			var bidsArray = PWT.bidMap[key][stringBidders];
			impressionID = PWT.bidMap[key][CONSTANTS.COMMON.IMPRESSION_ID];

			for(var adapter in bidsArray){

				//if bid-pass-thru is set then do not log the stringBidders
				// 1: do NOT log, do NOT auction
				// 2: do log, do NOT auction
				if(CONFIG.getBidPassThroughStatus(adapter) === 1){
					continue;
				}

				if(bidsArray[adapter] && bidsArray[adapter].bid ){

					for(var bidID in bidsArray[adapter].bid){
						if(! util.isOwnProperty(bidsArray[adapter].bid, bidID)){
							continue;
						}
						var theBid = bidsArray[adapter].bid[bidID];
						var endTime = theBid.getReceivedTime();
						//todo: take all these key names from constants
						slotObject["ps"].push({
							"pn": adapter,
							"bidid": bidID,
							"db": theBid.getDefaultBidStatus(),
							"kgpv": theBid.getKGPV(),
							"psz": theBid.getWidth() + "x" + theBid.getHeight(),
							"eg": theBid.getGrossEcpm(),
							"en": theBid.getNetEcpm(),
							"di": theBid.getDealID(),
							"dc": theBid.getDealChannel(),
							"l1": endTime - startTime,
							"l2": 0,
							"t": theBid.getPostTimeoutStatus() === false ? 0 : 1,
							"wb": theBid.getWinningBidStatus() === true ? 1 : 0
						});
						firePixel = true;
					}					
				}
			}
			outputObj["s"].push(slotObject);
		}
	}

	if(firePixel){			
		outputObj[CONSTANTS.CONFIG.PUBLISHER_ID] = CONFIG.getPublisherId();
		outputObj[CONSTANTS.LOGGER_PIXEL_PARAMS.TIMEOUT] = CONFIG.getTimeout();
		outputObj[CONSTANTS.LOGGER_PIXEL_PARAMS.PAGE_URL] = decodeURIComponent(util.pageURL);//todo change it 
		outputObj[CONSTANTS.LOGGER_PIXEL_PARAMS.TIMESTAMP] = util.getCurrentTimestamp();
		outputObj[CONSTANTS.COMMON.IMPRESSION_ID] = encodeURIComponent(impressionID);
		outputObj[CONSTANTS.CONFIG.PROFILE_ID] = CONFIG.getProfileID();
		outputObj[CONSTANTS.CONFIG.PROFILE_VERSION_ID] = CONFIG.getProfileDisplayVersionID();

		pixelURL += "pubid=" + CONFIG.getPublisherId()+"&json=" + encodeURIComponent(JSON.stringify(outputObj));
	}

	if(firePixel){
		(new Image()).src = util.protocol + pixelURL;
		//utilAjaxCall(
		//	utilMetaInfo.protocol + pixelURL + 'pubid=' + CONFIG.getPublisherId(),
		//	function(){},
		//	JSON.stringify(outputObj),
		//	{} // todo later
		//);
	}
};

exports.executeMonetizationPixel = function(slotID, theBid){
	var pixelURL = CONFIG.getMonetizationPixelURL();
	
	if(!pixelURL){
		return;
	}

	pixelURL += "pubid=" + CONFIG.getPublisherId();
	pixelURL += "&purl=" + utilMetaInfo.u;//todo
	pixelURL += "&tst=" + util.getCurrentTimestamp();
	pixelURL += "&iid=" + encodeURIComponent(PWT.bidMap[slotID].getImpressionID());
	pixelURL += "&bidid=" + encodeURIComponent(theBid.getBidID());
	pixelURL += "&pid=" + encodeURIComponent(CONFIG.getProfileID());
	pixelURL += "&pdvid=" + encodeURIComponent(CONFIG.getProfileDisplayVersionID());
	pixelURL += "&slot=" + encodeURIComponent(slotID);
	pixelURL += "&pn=" + encodeURIComponent(theBid.getAdapterID());
	pixelURL += "&en=" + encodeURIComponent(theBid.getNetEcpm());
	pixelURL += "&eg=" + encodeURIComponent(theBid.getGrossEcpm());
	pixelURL += "&kgpv=" + encodeURIComponent(theBid.getKGPV());

	(new Image()).src = util.protocol + pixelURL;//todo: protocol
};

//todo
// check if all bid comparisons are made on netEcpm
// check data types in logger pixel
// logger per impression id change