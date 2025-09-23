const Service = require("../models/servicesModal.js");
const mongoose = require("mongoose");

// exports.upsertService = async (req, res) => {
//   const {
//     name,
//     description,
//     icon,
//     serviceFor,
//     defaultSwitch,
//     providers,
//   } = req.body;

//   try {
//     let service = await Service.findOne({ name });

//     if (service) {
//       service.description = description || service.description;
//       service.icon = icon || service.icon;
//       service.serviceFor = serviceFor || service.serviceFor;
//       service.defaultSwitch = defaultSwitch || service.defaultSwitch;

//       const providerMap = service.providers.reduce((acc, p) => {
//         acc[p.providerName] = p;
//         return acc;
//       }, {});

//       for (const incoming of providers) {
//         if (providerMap[incoming.providerName]) {
//           Object.assign(providerMap[incoming.providerName], incoming);
//         } else {
//           service.providers.push(incoming);
//         }
//       }

//       await service.save();
//     } else {
//       service = await Service.create({
//         name,
//         description,
//         icon,
//         serviceFor,
//         defaultSwitch,
//         providers,
//       });
//     }

//     res.json({ success: true, data: service });
//   } catch (err) {
//     console.error("Error in upsertService:", err);
//     res.status(500).json({ success: false, message: "Internal Server Error" });
//   }
// };

exports.upsertService = async (req, res) => {
  try {
    const {
      name,
      description,
      icon,
      serviceFor,
      defaultSwitch,
      isActive,
      providers, // this can be an array of provider names from your form
    } = req.body;

    // normalize providers (if user sends string instead of array)
    const providerList = Array.isArray(providers)
      ? providers
      : providers
      ? [providers]
      : [];
    let service;
    if (req.query.id) {
      service = await Service.findOne({
        _id: new mongoose.Types.ObjectId(req.query.id),
      });

      if (service) {
        // update existing
        service.name = name || service.name;
        service.description = description || service.description;
        service.icon = icon || service.icon;
        // service.serviceFor = serviceFor || service.serviceFor;
        service.defaultSwitch = defaultSwitch || service.defaultSwitch;
        service.isActive = isActive || service.isActive;

        // Replace providers fully from form input
        service.providers = providerList;

        await service.save();
      }
    } else {
      // create new
      service = await Service.create({
        name,
        description,
        icon,
        // serviceFor,
        defaultSwitch,
        isActive,
        providers: providerList,
      });
    }

    res.json({ success: true, data: service });
  } catch (err) {
    console.error("Error in upsertService:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getAllServices = async (req, res) => {
  try {
    let { page = 1, limit, isActive, providerName, name } = req.query;

    const filter = {};

    if (name) filter.name = new RegExp(name, "i");
    if (isActive !== undefined) filter.isActive = isActive === "true";

    if (providerName) {
      filter.defaultSwitch = { $regex: providerName, $options: "i" };
    }

    page = parseInt(page);
    limit = limit ? parseInt(limit) : null;

    const skip = limit ? (page - 1) * limit : 0;

    const total = await Service.countDocuments(filter);
    console.log("Total services found:", total);
    let query = Service.find(filter).sort({ createdAt: -1 });

    if (limit) {
      query = query.skip(skip).limit(limit);
    }

    const services = await query;

    res.json({
      success: true,
      total,
      page,
      pages: limit ? Math.ceil(total / limit) : 1,
      data: services,
    });
  } catch (err) {
    console.error("Error in getAllServices:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getServiceById = async (req, res) => {

  try {
    const { id } = req.params;
    const service = await Service.findById(id);
    if (!service) {
      return res
        .status(404)
        .json({ success: false, message: "Service not found" });
    }
    res.json({ success: true, data: service });
  } catch (err) {
    console.error("Error in getServiceById:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    await Service.findByIdAndDelete(id);
    res.json({ success: true, message: "Service deleted" });
  } catch (err) {
    console.error("Error in deleteService:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.setServiceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, defaultSwitch } = req.body;

    const service = await Service.findById(id);
    if (!service) {
      return res
        .status(404)
        .json({ success: false, message: "Service not found" });
    }
    if (service.isActive === isActive) {
      return res.status(200).json({
        success: true,
        message: `Service is already ${isActive ? "Active" : "Inactive"}`,
        data: { id: service._id, isActive: service.isActive },
      });
    }
    service.isActive = isActive;

    if (defaultSwitch) {
      service.defaultSwitch = defaultSwitch;
    }
    await service.save();

    return res.status(200).json({
      success: true,
      message: `Service status set to ${isActive ? "Active" : "Inactive"}`,
      data: { id: service._id, isActive: service.isActive },
    });
  } catch (error) {
    console.error("Error in setServiceStatus:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
